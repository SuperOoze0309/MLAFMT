#!/usr/bin/env python3
"""Preview the static application with the isolation needed by local Office.

    python scripts/preview_local.py --directory dist/formcapy-v2.11.0-preview --port 8080

This server only serves files. It has no document upload or conversion endpoint.
"""
from __future__ import annotations

import argparse
import functools
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


class IsolatedStaticHandler(SimpleHTTPRequestHandler):
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".mjs": "text/javascript",
        ".wasm": "application/wasm",
        ".json": "application/json",
    }

    def end_headers(self):
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Cross-Origin-Embedder-Policy", "require-corp")
        self.send_header("Cross-Origin-Resource-Policy", "same-origin")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--directory", default="dist/browser-local", help="Frozen static build to serve")
    parser.add_argument("--port", type=int, default=8080)
    parser.add_argument("--bind", default="127.0.0.1", help="Defaults to this computer only")
    args = parser.parse_args(argv)
    directory = Path(args.directory).resolve()
    if not directory.is_dir():
        parser.error(f"Static build directory does not exist: {directory}")
    if not 0 <= args.port <= 65535:
        parser.error("--port must be between 0 and 65535")
    handler = functools.partial(IsolatedStaticHandler, directory=str(directory))
    with ThreadingHTTPServer((args.bind, args.port), handler) as server:
        host, port = server.server_address[:2]
        print(f"Static preview: http://{host}:{port}/", flush=True)
        print(f"Directory: {directory}", flush=True)
        print("COOP/COEP isolation enabled; Ctrl+C to stop.", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
