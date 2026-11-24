"""Serve the built app and the login capabilities fixture for the simulator."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit


class SimulatorWeb(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(Path("dist").resolve()), **kwargs)

    def do_GET(self):
        if urlsplit(self.path).path != "/api/account/capabilities":
            return super().do_GET()
        body = b'{"google":{"enabled":true},"kakao":{"enabled":true}}'
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


ThreadingHTTPServer(("127.0.0.1", 4173), SimulatorWeb).serve_forever()
