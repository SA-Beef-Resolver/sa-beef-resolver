"""Read-only HTTP API over the AI results stored in MongoDB.

The web gateway calls this instead of reading MongoDB itself, so the AI service keeps
ownership of its own database. It never writes and never calls the model.
"""
import json
import os
import re
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from core import Store

SESSION_PATH = re.compile(r"^/sessions/([A-Za-z0-9_-]{1,128})(/history)?/?$")
store = None


def get_store():
    global store
    if store is None:
        store = Store()
    return store


class Handler(BaseHTTPRequestHandler):
    def _send(self, status, body):
        data = json.dumps(body, ensure_ascii=False, default=str).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path == "/health":
            return self._send(200, {"status": "ok"})
        match = SESSION_PATH.match(self.path.split("?", 1)[0])
        if not match:
            return self._send(404, {"error": "Route not found."})
        session_id, history = match.groups()
        try:
            if history:
                return self._send(200, {"sessionId": session_id, "resolutions": get_store().get_resolutions(session_id)})
            result = get_store().get_session(session_id)
        except Exception:
            return self._send(503, {"error": "Result database is unavailable."})
        if result is None:
            return self._send(404, {"error": "No AI result for this session yet."})
        return self._send(200, result)

    def log_message(self, fmt, *args):
        pass  # request lines may contain session ids; keep logs quiet


if __name__ == "__main__":
    port = int(os.getenv("AI_API_PORT", "8000"))
    print(f"AI result API listening on :{port}", flush=True)
    ThreadingHTTPServer(("0.0.0.0", port), Handler).serve_forever()
