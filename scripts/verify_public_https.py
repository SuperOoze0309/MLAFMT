#!/usr/bin/env python3
"""Check the public FormCapy deployment using Python's standard library.

Run after deployment (no Flask server or extra packages are needed)::

    python scripts/verify_public_https.py
    python scripts/verify_public_https.py --asset /runtime/pyodide/314.0.7/pyodide.asm.wasm --asset /static/transport.js

Both the root domain and www must serve trusted HTTPS before any redirect is
followed. HTTP requests for / and a path/query probe must redirect immediately
to HTTPS, preserve the path/query through the chain, and avoid loops. A 404 for
the deliberately nonexistent probe path is allowed. Root HTTPS and explicitly
listed assets must finish with HTTP 200. Asset redirects must stay on the root
HTTPS origin; .wasm assets must have the application/wasm content type.

Certificate chain and hostname verification always use the system CA store.
There is no insecure mode. TLS version and certificate expiry are printed for
each HTTPS hostname contacted. Only the first eight response bytes are read;
documents and runtime files are not saved. This checks network configuration,
not Safari/iPhone/iPad UI behavior or whether the document formatter works.

Exit status: 0 = all checks passed; 1 = one or more checks failed; 2 = bad CLI
arguments. Use --probe-path if the default path needs to be changed.
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass
from datetime import datetime, timezone
import http.client
import re
import socket
import ssl
import sys
from urllib.parse import urljoin, urlsplit, urlunsplit


REDIRECT_STATUSES = {301, 302, 303, 307, 308}
DEFAULT_PROBE = "/__formcapy_https_check__/keep%20path?formcapy_https_check=1&value=a%2Bb"
CONTROL_CHARACTERS = re.compile(r"[\x00-\x20\x7f]")


class CheckFailure(Exception):
    """An actionable deployment-check failure."""


@dataclass(frozen=True)
class Response:
    status: int
    location: str | None
    content_type: str
    prefix: bytes


def domain_argument(value: str) -> str:
    """Accept a bare domain, never a URL, path, port, or user information."""
    try:
        domain = value.rstrip(".").encode("idna").decode("ascii").lower()
    except UnicodeError as error:
        raise argparse.ArgumentTypeError("Use a valid bare domain name.") from error
    labels = domain.split(".")
    if len(domain) > 253 or len(labels) < 2 or any(
        not re.fullmatch(r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?", label)
        for label in labels
    ):
        raise argparse.ArgumentTypeError("Use a bare domain such as formcapy.com.")
    return domain


def path_argument(value: str) -> str:
    """Require an origin-relative URL path, optionally followed by a query."""
    try:
        parts = urlsplit(value)
    except ValueError as error:
        raise argparse.ArgumentTypeError("Use a valid encoded path.") from error
    if (
        not value.startswith("/")
        or value.startswith("//")
        or parts.scheme
        or parts.netloc
        or parts.fragment
        or CONTROL_CHARACTERS.search(value)
    ):
        raise argparse.ArgumentTypeError(
            "Use an encoded path such as /runtime/file.wasm, optionally with ?query."
        )
    return value


def positive_timeout(value: str) -> float:
    try:
        timeout = float(value)
    except ValueError as error:
        raise argparse.ArgumentTypeError("Timeout must be a number of seconds.") from error
    if not 0 < timeout <= 120:
        raise argparse.ArgumentTypeError("Timeout must be greater than 0 and at most 120 seconds.")
    return timeout


def redirect_limit(value: str) -> int:
    try:
        limit = int(value)
    except ValueError as error:
        raise argparse.ArgumentTypeError("Redirect limit must be an integer.") from error
    if not 1 <= limit <= 20:
        raise argparse.ArgumentTypeError("Redirect limit must be between 1 and 20.")
    return limit


class Verifier:
    def __init__(self, domain: str, timeout: float, max_redirects: int):
        self.domain = domain
        self.hosts = {domain, "www." + domain}
        self.timeout = timeout
        self.max_redirects = max_redirects
        self.context = ssl.create_default_context()
        self.context.minimum_version = ssl.TLSVersion.TLSv1_2
        # create_default_context verifies both the CA chain and requested host.
        # Keep these explicit so later edits cannot silently add an insecure mode.
        self.context.verify_mode = ssl.CERT_REQUIRED
        self.context.check_hostname = True
        self.reported_certificates: set[tuple[str, str, str]] = set()

    def parts(self, url: str):
        try:
            parts = urlsplit(url)
            port = parts.port
        except ValueError as error:
            raise CheckFailure(f"Malformed redirect URL: {url!r}") from error
        if (
            parts.scheme not in {"http", "https"}
            or not parts.hostname
            or parts.hostname.lower() not in self.hosts
            or parts.username is not None
            or parts.password is not None
            or CONTROL_CHARACTERS.search(url)
        ):
            raise CheckFailure(f"Unexpected URL or hostname: {url!r}")
        expected_port = 443 if parts.scheme == "https" else 80
        if port not in (None, expected_port):
            raise CheckFailure(f"Unexpected port in URL: {url!r}")
        return parts

    def report_tls(self, host: str, connection: http.client.HTTPSConnection) -> None:
        tls_socket = connection.sock
        if tls_socket is None:
            raise CheckFailure(f"No TLS connection was established for {host}.")
        certificate = tls_socket.getpeercert()
        expiry = certificate.get("notAfter")
        if not expiry:
            raise CheckFailure(f"The verified certificate for {host} has no expiry date.")
        try:
            expires = datetime.fromtimestamp(ssl.cert_time_to_seconds(expiry), timezone.utc)
        except (ValueError, OverflowError) as error:
            raise CheckFailure(f"Cannot parse certificate expiry for {host}.") from error
        version = tls_socket.version() or "unknown TLS version"
        key = (host, version, expiry)
        if key not in self.reported_certificates:
            self.reported_certificates.add(key)
            days = (expires - datetime.now(timezone.utc)).total_seconds() / 86400
            print(
                f"  TLS {host}: {version}; trusted chain and hostname; "
                f"expires {expires:%Y-%m-%d %H:%M:%S UTC} ({days:.1f} days)"
            )

    def request(self, url: str) -> Response:
        parts = self.parts(url)
        host = parts.hostname.lower()
        connection: http.client.HTTPConnection
        if parts.scheme == "https":
            connection = http.client.HTTPSConnection(
                host, timeout=self.timeout, context=self.context
            )
        else:
            connection = http.client.HTTPConnection(host, timeout=self.timeout)
        try:
            connection.connect()
            if isinstance(connection, http.client.HTTPSConnection):
                self.report_tls(host, connection)
            target = urlunsplit(("", "", parts.path or "/", parts.query, ""))
            connection.request(
                "GET", target,
                headers={
                    "User-Agent": "FormCapy-HTTPS-Check/1.0",
                    "Accept": "*/*",
                    "Accept-Encoding": "identity",
                    "Connection": "close",
                },
            )
            response = connection.getresponse()
            return Response(
                status=response.status,
                location=response.getheader("Location"),
                content_type=response.getheader("Content-Type", ""),
                prefix=response.read(8),
            )
        except ssl.SSLCertVerificationError as error:
            raise CheckFailure(f"Certificate verification failed for {host}: {error}") from error
        except (OSError, http.client.HTTPException, UnicodeError) as error:
            raise CheckFailure(f"Request failed for {url}: {error}") from error
        finally:
            connection.close()

    def follow(
        self,
        start: str,
        *,
        preserve_path_query: bool = False,
        asset: bool = False,
    ) -> tuple[str, Response]:
        initial = self.parts(start)
        expected_path_query = (initial.path or "/", initial.query)
        seen = set()
        current = start
        for redirects in range(self.max_redirects + 1):
            parts = self.parts(current)
            key = (parts.scheme, parts.hostname.lower(), parts.path or "/", parts.query)
            if key in seen:
                raise CheckFailure(f"Redirect loop at {current}")
            seen.add(key)
            if asset and (parts.scheme != "https" or parts.hostname.lower() != self.domain):
                raise CheckFailure(f"Asset left the same HTTPS origin: {current}")
            if preserve_path_query and (parts.path or "/", parts.query) != expected_path_query:
                raise CheckFailure(f"Redirect changed the path or query: {current}")
            response = self.request(current)
            print(f"  {response.status} {current}")
            if response.status not in REDIRECT_STATUSES:
                if parts.scheme != "https":
                    raise CheckFailure("HTTP did not redirect to HTTPS.")
                return current, response
            if not response.location:
                raise CheckFailure(f"HTTP {response.status} has no Location header.")
            if redirects == self.max_redirects:
                raise CheckFailure(f"More than {self.max_redirects} redirects.")
            destination = urljoin(current, response.location)
            next_parts = self.parts(destination)
            if next_parts.scheme != "https":
                raise CheckFailure(f"Redirect destination is not HTTPS: {destination}")
            # URL fragments are not sent in HTTP requests and do not prevent loops.
            current = urlunsplit(next_parts._replace(fragment=""))
        raise CheckFailure("Redirect limit exceeded.")

    def check_home(self, host: str) -> None:
        _, response = self.follow(f"https://{host}/")
        if response.status != 200:
            raise CheckFailure(f"HTTPS home page returned {response.status}; expected 200.")

    def check_upgrade(self, host: str, path: str) -> None:
        _, response = self.follow(f"http://{host}{path}", preserve_path_query=True)
        if response.status >= 500:
            raise CheckFailure(f"HTTPS destination returned server error {response.status}.")

    def check_asset(self, path: str) -> None:
        final_url, response = self.follow(f"https://{self.domain}{path}", asset=True)
        if response.status != 200:
            raise CheckFailure(f"Asset returned {response.status}; expected 200.")
        if urlsplit(path).path.lower().endswith(".wasm") or urlsplit(final_url).path.lower().endswith(".wasm"):
            content_type = response.content_type.split(";", 1)[0].strip().lower()
            if content_type != "application/wasm":
                raise CheckFailure(
                    f"WASM Content-Type is {response.content_type!r}; expected application/wasm."
                )
            if not response.prefix.startswith(b"\x00asm"):
                raise CheckFailure("WASM response does not start with the WASM magic bytes.")
        print(f"  Content-Type: {response.content_type or '(missing)'}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--domain", default="formcapy.com", type=domain_argument,
                        help="Canonical bare root domain (default: formcapy.com).")
    parser.add_argument("--asset", action="append", default=[], type=path_argument,
                        help="Same-origin asset path to check; repeat for multiple files.")
    parser.add_argument("--probe-path", default=DEFAULT_PROBE, type=path_argument,
                        help="Encoded path/query used to check redirect preservation.")
    parser.add_argument("--timeout", default=15.0, type=positive_timeout,
                        help="Per-connection/socket timeout in seconds (default: 15).")
    parser.add_argument("--max-redirects", default=8, type=redirect_limit,
                        help="Maximum redirects per check (default: 8).")
    args = parser.parse_args()
    verifier = Verifier(args.domain, args.timeout, args.max_redirects)
    checks = []
    for host in (args.domain, "www." + args.domain):
        checks.extend([
            (f"Trusted HTTPS: {host}", verifier.check_home, host),
            (f"HTTP upgrade: {host}/", verifier.check_upgrade, host, "/"),
            (f"HTTP path/query preservation: {host}", verifier.check_upgrade, host, args.probe_path),
        ])
    checks.extend((f"Same-origin asset: {path}", verifier.check_asset, path) for path in args.asset)
    failures = 0
    for label, check, *parameters in checks:
        print(f"\nCHECK {label}")
        try:
            check(*parameters)
        except (CheckFailure, socket.timeout) as error:
            failures += 1
            print(f"FAIL {label}: {error}", file=sys.stderr)
        else:
            print(f"PASS {label}")
    print(f"\nResult: {len(checks) - failures}/{len(checks)} passed; {failures} failed.")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
