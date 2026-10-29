#!/usr/bin/env python3
"""Verify a deployed frozen FormCapy build with trusted TLS and GETs only.

Run only after deployment, for example::

    python scripts/verify_conversion_deployment.py --base https://formcapy.com \
      --dist dist/formcapy-v2.11.0-standalone-preview --out build/v2.11.0/production

The root host gets a full size/SHA-256 sweep by default. The www host gets the
pages, manifest, all Office chunks/fonts, workers, Python, licenses and converter
scripts; --www-scope all performs a second complete sweep. _headers is a host
configuration file, not a downloadable asset. No document is submitted, no POST
is made, no TLS bypass is available, and a failed request is never retried.
"""
from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
import gzip
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path, PurePosixPath
import re
import ssl
import threading
import urllib.error
import urllib.request
from urllib.parse import quote, urljoin, urlsplit, urlunsplit


REDIRECTS = {301, 302, 303, 307, 308}
SECURITY = {
    "cross-origin-opener-policy": "same-origin",
    "cross-origin-embedder-policy": "require-corp",
    "x-content-type-options": "nosniff",
}
PROBE = "/__formcapy_conversion_https_check__/keep%20path?check=2.11&value=a%2Bb"


class VerificationFailure(RuntimeError):
    pass


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, file_pointer, code, message, headers, new_url):
        return None


class Page(HTMLParser):
    def __init__(self):
        super().__init__()
        self.meta = {}
        self.ids = set()
        self.links = []
        self.scripts = []

    def handle_starttag(self, tag, attributes):
        attributes = dict(attributes)
        if attributes.get("id"):
            self.ids.add(attributes["id"])
        if tag == "meta" and attributes.get("name"):
            self.meta[attributes["name"]] = attributes.get("content", "")
        if tag == "a":
            self.links.append(attributes.get("href", ""))
        if tag == "script":
            self.scripts.append(attributes.get("src", ""))


def sha256(path: Path) -> str:
    result = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            result.update(block)
    return result.hexdigest()


def key_asset(name: str) -> bool:
    return name in {"index.html", "converter.html", "manifest.json", "sw.js", "THIRD-PARTY-NOTICES.txt", "LICENSE.txt"} or name.startswith((
        "browser/", "python/", "runtime/office/", "licenses/", "static/converter-page.",
        "static/document-converter.", "static/local-office.", "static/transport.", "static/update-notice.",
    ))


class Verifier:
    def __init__(self, hosts, timeout, report):
        self.hosts = set(hosts)
        self.timeout = timeout
        self.report = report
        self.lock = threading.Lock()
        self.results = {}
        self.payloads = {}
        self.context = ssl.create_default_context()
        self.context.minimum_version = ssl.TLSVersion.TLSv1_2
        self.context.verify_mode = ssl.CERT_REQUIRED
        self.context.check_hostname = True

    def validate_url(self, url):
        parts = urlsplit(url)
        if parts.scheme not in {"http", "https"} or parts.hostname not in self.hosts or parts.username or parts.password or parts.fragment:
            raise VerificationFailure(f"Unexpected redirect destination: {url}")
        if parts.port not in (None, 443 if parts.scheme == "https" else 80) or re.search(r"[\x00-\x20\x7f]", url):
            raise VerificationFailure(f"Unexpected port or unencoded URL: {url}")
        return parts

    def request(self, url, keep_body=False):
        parts = self.validate_url(url)
        item = {"method": "GET", "url": url, "started": datetime.now(timezone.utc).isoformat(), "trusted_tls": parts.scheme == "https"}
        with self.lock:
            self.report["requests"].append(item)
        opener = urllib.request.build_opener(urllib.request.HTTPSHandler(context=self.context), NoRedirect())
        request = urllib.request.Request(url, method="GET", headers={"User-Agent": "FormCapy-Deployment-Verification/2.11", "Accept": "*/*", "Accept-Encoding": "identity"})
        try:
            try:
                response = opener.open(request, timeout=self.timeout)
            except urllib.error.HTTPError as error:
                response = error
            with response:
                headers = {key.lower(): value for key, value in response.headers.items()}
                item.update(status=response.status, headers=headers)
                if response.status in REDIRECTS:
                    return {"status": response.status, "headers": headers, "size": 0, "sha256": None, "body": b""}
                encoding = headers.get("content-encoding", "identity").lower()
                if encoding not in {"", "identity", "gzip"}:
                    raise VerificationFailure(f"Unexpected Content-Encoding {encoding!r}: {url}")
                stream = gzip.GzipFile(fileobj=response) if encoding == "gzip" else response
                digest = hashlib.sha256()
                size = 0
                saved = []
                for block in iter(lambda: stream.read(1024 * 1024), b""):
                    size += len(block)
                    if size > 128 * 1024 * 1024:
                        raise VerificationFailure(f"Asset exceeds verification size limit: {url}")
                    digest.update(block)
                    if keep_body:
                        if size > 4 * 1024 * 1024:
                            raise VerificationFailure(f"Page/manifest unexpectedly large: {url}")
                        saved.append(block)
                item.update(size=size, sha256=digest.hexdigest())
                return {"status": response.status, "headers": headers, "size": size, "sha256": digest.hexdigest(), "body": b"".join(saved)}
        except Exception as error:
            item["error"] = str(error)
            raise VerificationFailure(f"GET failed without retry: {url}: {error}") from error

    def follow(self, start, keep_body=False, preserve=False, first_http_upgrade=False):
        current = start
        seen = set()
        initial = self.validate_url(start)
        path_query = (initial.path or "/", initial.query)
        chain = []
        for hop in range(9):
            parts = self.validate_url(current)
            if current in seen:
                raise VerificationFailure(f"Redirect loop: {current}")
            seen.add(current)
            if hop and parts.scheme != "https":
                raise VerificationFailure(f"Redirect failed to stay on HTTPS: {current}")
            if preserve and (parts.path or "/", parts.query) != path_query:
                raise VerificationFailure(f"Redirect changed encoded path/query: {start} -> {current}")
            response = self.request(current, keep_body=keep_body)
            chain.append({"url": current, "status": response["status"], "location": response["headers"].get("location")})
            if response["status"] not in REDIRECTS:
                if parts.scheme != "https":
                    raise VerificationFailure(f"Plain HTTP did not upgrade: {start}")
                if first_http_upgrade and hop == 0:
                    raise VerificationFailure(f"Plain HTTP was served without a redirect: {start}")
                return current, response, chain
            location = response["headers"].get("location")
            if not location:
                raise VerificationFailure(f"Redirect has no Location: {current}")
            current = urljoin(current, location)
            destination = self.validate_url(current)
            if first_http_upgrade and hop == 0 and destination.scheme != "https":
                raise VerificationFailure(f"First plain HTTP redirect does not upgrade to HTTPS: {start}")
        raise VerificationFailure(f"Too many redirects: {start}")

    def asset(self, host, reference):
        name = reference["path"]
        key = (host, name)
        if key in self.results:
            return self.results[key]
        url = f"https://{host}/" + quote(name, safe="/._~-@")
        keep_body = name in {"index.html", "converter.html", "manifest.json"}
        final, response, chain = self.follow(url, keep_body=keep_body)
        if response["status"] != 200:
            raise VerificationFailure(f"Expected HTTP 200, got {response['status']}: {url}")
        for header, expected in SECURITY.items():
            if response["headers"].get(header) != expected:
                raise VerificationFailure(f"Missing {header}: {expected} at {url}")
        if (response["size"], response["sha256"]) != (reference["size"], reference["sha256"]):
            raise VerificationFailure(f"Frozen bytes differ at {url}: size={response['size']}, SHA-256={response['sha256']}")
        mime = response["headers"].get("content-type", "").split(";", 1)[0].lower()
        if name.endswith((".js", ".mjs")) and mime not in {"application/javascript", "text/javascript"}:
            raise VerificationFailure(f"Wrong JavaScript MIME {mime!r}: {url}")
        if name.endswith(".wasm") and mime != "application/wasm":
            raise VerificationFailure(f"Wrong WASM MIME {mime!r}: {url}")
        if name.endswith(".html") and mime != "text/html":
            raise VerificationFailure(f"Wrong HTML MIME {mime!r}: {url}")
        result = {"host": host, "path": name, "url": final, "size": response["size"], "sha256": response["sha256"], "content_type": mime, "headers": response["headers"], "redirects": chain}
        with self.lock:
            self.results[key] = result
            self.report["assets"].append(result)
            if keep_body:
                self.payloads[key] = response["body"]
        return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base", default="https://formcapy.com")
    parser.add_argument("--dist", type=Path, default=Path("dist/formcapy-v2.11.0-standalone-preview"))
    parser.add_argument("--out", type=Path, default=Path("build/v2.11.0/production"))
    parser.add_argument("--scope", choices=("all", "key"), default="all")
    parser.add_argument("--www-scope", choices=("all", "key"), default="key")
    parser.add_argument("--timeout", type=float, default=60)
    parser.add_argument("--workers", type=int, default=6)
    args = parser.parse_args()
    base = urlsplit(args.base)
    if base.scheme != "https" or not base.hostname or base.username or base.password or base.path not in ("", "/") or base.query or base.fragment or base.port not in (None, 443):
        parser.error("--base must be a trusted HTTPS origin without credentials, path, query or fragment")
    if not 1 <= args.workers <= 12 or not 0 < args.timeout <= 180:
        parser.error("--workers must be 1..12 and --timeout must be >0 and <=180")
    primary = base.hostname[4:] if base.hostname.startswith("www.") else base.hostname
    hosts = [primary, "www." + primary]
    dist = args.dist.resolve()
    args.out.mkdir(parents=True, exist_ok=True)
    report = {"started": datetime.now(timezone.utc).isoformat(), "base": args.base, "dist": str(dist), "scopes": {hosts[0]: args.scope, hosts[1]: args.www_scope}, "requests": [], "assets": [], "checks": [], "errors": [], "automatic_retries": 0, "trusted_tls_only": True}
    status = 1
    try:
        manifest_path = dist / "manifest.json"
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        version = manifest["application"]["version"]
        references = []
        for item in manifest["files"]:
            name = item["path"]
            if name == "_headers":
                continue
            if not name or "\\" in name or PurePosixPath(name).is_absolute() or ".." in PurePosixPath(name).parts:
                raise VerificationFailure(f"Invalid frozen manifest path: {name!r}")
            local = (dist / name).resolve()
            if not local.is_relative_to(dist) or not local.is_file() or local.stat().st_size != item["size"] or sha256(local) != item["sha256"]:
                raise VerificationFailure(f"Local frozen build no longer matches its manifest: {name}")
            references.append(item)
        references.append({"path": "manifest.json", "size": manifest_path.stat().st_size, "sha256": sha256(manifest_path)})
        by_name = {item["path"]: item for item in references}
        verifier = Verifier(hosts, args.timeout, report)
        report.update(version=version, cache_version=manifest["cache_version"], manifest_sha256=sha256(manifest_path), skipped=["_headers"])
        # Validate release identity before downloading the heavy engine once.
        for host in hosts:
            for name in ("manifest.json", "index.html", "converter.html"):
                verifier.asset(host, by_name[name])
            public_manifest = json.loads(verifier.payloads[(host, "manifest.json")])
            if public_manifest["application"]["version"] != version or public_manifest["cache_version"] != manifest["cache_version"]:
                raise VerificationFailure(f"Wrong public version/cache: {host}")
            home = Page(); home.feed(verifier.payloads[(host, "index.html")].decode("utf-8"))
            tool = Page(); tool.feed(verifier.payloads[(host, "converter.html")].decode("utf-8"))
            if home.meta.get("formcapy-version") != version or tool.meta.get("formcapy-version") != version:
                raise VerificationFailure(f"Wrong page version metadata: {host}")
            if not any(urlsplit(link).path.rstrip("/").endswith("converter.html") for link in home.links):
                raise VerificationFailure(f"Homepage has no independent converter entry: {host}")
            if "document-converter-mount" in home.ids or any("document-converter.js" in script for script in home.scripts):
                raise VerificationFailure(f"Homepage still embeds the converter: {host}")
            if "conversion-heading" not in tool.ids or "document-converter-mount" not in tool.ids or not any(urlsplit(link).path.endswith("index.html") for link in tool.links):
                raise VerificationFailure(f"Standalone converter heading/mount/home navigation missing: {host}")
            if tool.ids.intersection({"name", "title", "course", "instructor", "format-id", "web-download"}):
                raise VerificationFailure(f"Standalone converter still contains essay controls: {host}")
            report["checks"].append({"name": "release version, independent converter navigation and frozen page bytes", "host": host, "passed": True})
        for host in hosts:
            scope = args.scope if host == hosts[0] else args.www_scope
            selected = [item for item in references if scope == "all" or key_asset(item["path"])]
            pending = [item for item in selected if (host, item["path"]) not in verifier.results]
            completed = 0
            with ThreadPoolExecutor(max_workers=args.workers) as pool:
                futures = {pool.submit(verifier.asset, host, item): item for item in pending}
                for future in as_completed(futures):
                    item = futures[future]
                    try:
                        future.result()
                    except Exception as error:
                        report["errors"].append({"host": host, "path": item["path"], "error": str(error)})
                        print(f"FAIL {host}/{item['path']}: {error}", flush=True)
                    completed += 1
                    if completed % 25 == 0 or completed == len(pending):
                        print(f"Checked {host}: {completed}/{len(pending)} remaining assets (no retries)", flush=True)
            report["checks"].append({"name": "frozen file size/SHA-256, security headers and MIME sweep", "host": host, "scope": scope, "selected": len(selected), "passed": not any(error.get("host") == host for error in report["errors"])})
        for host in hosts:
            for probe in ("/", PROBE):
                final, response, chain = verifier.follow(f"http://{host}{probe}", preserve=True, first_http_upgrade=True)
                if response["status"] not in ({200} if probe == "/" else {200, 404}):
                    raise VerificationFailure(f"Unexpected HTTP upgrade probe result: {host}{probe}: {response['status']}")
                report["checks"].append({"name": "HTTP immediately upgrades to trusted HTTPS while preserving encoded path/query", "host": host, "probe": probe, "url": final, "redirects": chain, "passed": True})
        report["get_only"] = all(item["method"] == "GET" for item in report["requests"])
        if not report["get_only"]:
            raise VerificationFailure("Verifier emitted a non-GET request")
        report["audit_scope"] = "GET-only static deployment audit. No draft was sent. This does not replace the separate real-browser conversion/network audit."
        report["ok"] = not report["errors"]
        status = 0 if report["ok"] else 1
    except Exception as error:
        report["ok"] = False
        report["errors"].append({"error": str(error)})
        print(f"FAIL {error}", flush=True)
    finally:
        report["completed"] = datetime.now(timezone.utc).isoformat()
        report["assets"].sort(key=lambda item: (item["host"], item["path"]))
        report["summary"] = {"assets_verified": len(report["assets"]), "decoded_bytes_verified": sum(item["size"] for item in report["assets"]), "requests": len(report["requests"]), "errors": len(report["errors"])}
        destination = args.out / "deployment-verification.json"
        destination.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"{'PASS' if report.get('ok') else 'FAIL'} deployment verification: {json.dumps(report['summary'])}", flush=True)
        print(f"Report: {destination}", flush=True)
    raise SystemExit(status)


if __name__ == "__main__":
    main()
