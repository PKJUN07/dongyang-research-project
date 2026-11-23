"""검증용 프론트엔드 실행기 (npm 없이 사용).

frontend/dist 의 빌드 결과를 http://127.0.0.1:5179 에서 제공하고
/api 요청은 백엔드(기본 http://127.0.0.1:18089)로 전달한다.
표준 라이브러리만 사용한다.

사용법:  python runtime\\serve_frontend.py [포트] [백엔드주소]
"""
import http.server
import os
import sys
import urllib.error
import urllib.request

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend", "dist"))
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 5179
BACKEND = (sys.argv[2] if len(sys.argv) > 2 else "http://127.0.0.1:18089").rstrip("/")
HOP = {"connection", "keep-alive", "transfer-encoding", "te", "trailer", "upgrade",
       "proxy-authorization", "proxy-authenticate", "host", "content-length"}
TYPES = {".js": "text/javascript", ".css": "text/css", ".html": "text/html; charset=utf-8",
         ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json"}


class Handler(http.server.BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        sys.stderr.write("%s %s\n" % (self.command, self.path))

    def _send(self, status, body, ctype, extra=None):
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        for k, v in (extra or []):
            self.send_header(k, v)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def _proxy(self):
        length = int(self.headers.get("Content-Length") or 0)
        data = self.rfile.read(length) if length else None
        req = urllib.request.Request(BACKEND + self.path, data=data, method=self.command)
        for k, v in self.headers.items():
            if k.lower() not in HOP:
                req.add_header(k, v)
        try:
            with urllib.request.urlopen(req, timeout=330) as res:
                status, headers, body = res.status, res.getheaders(), res.read()
        except urllib.error.HTTPError as err:
            status, headers, body = err.code, err.headers.items(), err.read()
        except Exception as err:  # 백엔드가 꺼져 있음
            msg = ('{"code":"BACKEND_UNAVAILABLE","message":"백엔드 서버에 연결할 수 없습니다: %s"}' % type(err).__name__).encode()
            return self._send(502, msg, "application/json; charset=utf-8")
        self.send_response(status)
        for k, v in headers:
            if k.lower() not in HOP:
                self.send_header(k, v)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _static(self):
        path = self.path.split("?", 1)[0].split("#", 1)[0]
        target = os.path.abspath(os.path.join(ROOT, urllib.request.url2pathname(path.lstrip("/"))))
        if not target.startswith(ROOT) or not os.path.isfile(target):
            target = os.path.join(ROOT, "index.html")  # React Router 경로 직접 접근
        if not os.path.isfile(target):
            return self._send(503, "frontend/dist 가 없습니다. 빌드 결과를 먼저 복사하세요.".encode(), "text/plain; charset=utf-8")
        with open(target, "rb") as f:
            body = f.read()
        self._send(200, body, TYPES.get(os.path.splitext(target)[1], "application/octet-stream"))

    def _route(self):
        if self.path.startswith("/api/") or self.path == "/api":
            self._proxy()
        else:
            self._static()

    do_GET = do_HEAD = do_POST = do_PUT = do_PATCH = do_DELETE = _route


if __name__ == "__main__":
    print("ResearchBoard 검증용 웹: http://127.0.0.1:%d  (API → %s, 정적 파일: %s)" % (PORT, BACKEND, ROOT))
    http.server.ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
