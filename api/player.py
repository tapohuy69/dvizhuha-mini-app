import os
import json
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler


class handler(BaseHTTPRequestHandler):

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        params = urllib.parse.parse_qs(parsed.query)

        tag = params.get("tag", [""])[0].strip().replace("#", "")

        if not tag:
            self.send_json(
                400,
                {"error": "Укажи тег игрока"}
            )
            return

        token = os.environ.get("CR_API_TOKEN")

        if not token:
            self.send_json(
                500,
                {"error": "CR_API_TOKEN не настроен"}
            )
            return

        url = "https://api.clashroyale.com/v1/players/%23" + urllib.parse.quote(tag)

        request = urllib.request.Request(
            url,
            headers={
                "Authorization": "Bearer " + token
            }
        )

        try:
            with urllib.request.urlopen(request, timeout=10) as response:
                data = response.read().decode("utf-8")

                self.send_json(
                    response.status,
                    json.loads(data)
                )

        except urllib.error.HTTPError as error:
            body = error.read().decode("utf-8")

            try:
                data = json.loads(body)
            except:
                data = {"error": "Ошибка Clash Royale API"}

            self.send_json(error.code, data)

        except Exception as error:
            self.send_json(
                500,
                {"error": "Ошибка сервера"}
            )

    def send_json(self, status, data):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")

        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

        self.wfile.write(body)
