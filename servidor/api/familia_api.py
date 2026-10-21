#!/usr/bin/env python3
"""API de la app «Casa» (la PWA del iPad y los móviles).

Escucha SOLO en 127.0.0.1 («api.puerto», 8125 por defecto). Se publica dentro de tu red privada de Tailscale con
`tailscale serve`, que pone el HTTPS: nada queda abierto a Internet. Cada petición lleva la cabecera
`X-Familia` con el token de secretos/app.token.

  GET  /api/estado                 → {"ok", "version", "calendarios", "compra"}  (para «Probar conexión»)
  GET  /api/calendarios            → [{"clave","nombre","color","papel"}]  (solo los que tienen dirección iCal)
  GET  /api/ics/<clave>            → el iCal de ese calendario (la dirección secreta nunca sale del servidor)
  GET  /api/luz?desde=AAAA-MM-DD&hasta=AAAA-MM-DD → PVPC de Red Eléctrica (por si el navegador no llega a REE)
  GET  /api/compra                 → compra.json (lo escribe scripts/compra_export.py cada minuto)
  POST /api/compra/quitar  {"producto"} → lo marca comprado en Bring! (compra_sync.py lo quita de Alexa)
  POST /api/compra/anadir  {"producto"} → lo añade a Bring! (o lo vuelve a pedir si estaba comprado)

Configuración: config/familia.json («calendarios», «home_assistant», «api»). Secretos (chmod 600, nunca en git):
secretos/app.token, secretos/calendarios.properties y ha.token. Solo biblioteca estándar de Python 3.9+.

Uso: python3 -I api/familia_api.py
"""
from __future__ import annotations

import datetime
import hmac
import json
import os
import re
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "scripts"))
import familia  # noqa: E402

VERSION = "1.0"
CFG = familia.config()
API = CFG.get("api", {})
PUERTO = int(API.get("puerto", 8125))
ORIGENES = [o.rstrip("/") for o in API.get("origenes", []) if not o.startswith("_")]
APP_TOKEN = familia.leer(familia.ruta("app_token", "secretos/app.token"))
CAL_PROPS = familia.ruta("calendarios_secretos", "secretos/calendarios.properties")
COMPRA_JSON = familia.ruta("compra_json", "publico/compra.json")
HA = familia.ha_url()
BRING = familia.ha().get("compra_bring", "")
MAX_BODY = 2048
MAX_ICS = 10 * 1024 * 1024
ICS_TTL, LUZ_TTL = 5 * 60, 15 * 60
_cache: dict[str, tuple[float, bytes]] = {}
_lock = threading.Lock()

if len(APP_TOKEN) < 24:
    raise SystemExit("ERROR: secretos/app.token es demasiado corto (créalo con: openssl rand -hex 32 > secretos/app.token)")


def propiedades(path: str) -> dict[str, str]:
    """Fichero clave=valor (las líneas con # son comentarios)."""
    out = {}
    try:
        with open(path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    out[k.strip()] = v.strip()
    except FileNotFoundError:
        pass
    return out


def calendarios() -> list[dict]:
    """Calendarios de familia.json que tienen dirección iCal en secretos/calendarios.properties."""
    props = propiedades(CAL_PROPS)
    out = []
    for clave, c in CFG.get("calendarios", {}).items():
        if clave.startswith("_") or not isinstance(c, dict):
            continue
        url = props.get(f"{clave}.ics", "")
        if url and "<" not in url:
            out.append({"clave": clave, "nombre": c.get("nombre", clave), "color": c.get("color", "#3B6FD8"),
                        "papel": c.get("papel", "events"), "_url": url})
    return out


def descargar(url: str, ttl: int, limite: int = MAX_ICS) -> bytes:
    """GET con caché en memoria; si falla y hay copia, devuelve la copia."""
    ahora = time.time()
    with _lock:
        hit = _cache.get(url)
    if hit and ahora - hit[0] < ttl:
        return hit[1]
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "casa-familia/1.0"})
        with urllib.request.urlopen(req, timeout=20) as r:
            data = r.read(limite + 1)
        if len(data) > limite:
            raise ValueError("respuesta demasiado grande")
    except Exception:
        if hit:
            return hit[1]
        raise
    with _lock:
        _cache[url] = (ahora, data)
    return data


def ha(path: str, body: dict | None = None):
    req = urllib.request.Request(HA + path, data=json.dumps(body).encode() if body is not None else None,
                                 method="POST" if body is not None else "GET",
                                 headers={"Authorization": f"Bearer {familia.ha_token()}", "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read() or b"null")


EXPORT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "scripts", "compra_export.py")


def reexportar() -> None:
    """Tras tachar o añadir, rehace compra.json en segundo plano para que la app lo vea al momento."""
    def run():
        try:
            subprocess.run([sys.executable, "-I", EXPORT], timeout=60, check=False,
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        except Exception:  # noqa: BLE001
            pass  # el bucle de cada minuto lo hará igualmente
    threading.Thread(target=run, daemon=True).start()


def bring_items(status: str | None = None) -> list[dict]:
    body = {"entity_id": BRING}
    if status:
        body["status"] = status
    return ha("/api/services/todo/get_items?return_response", body)["service_response"][BRING]["items"]


class Handler(BaseHTTPRequestHandler):
    server_version = "casa-familia"
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):  # sin registro de accesos
        pass

    # ---- respuesta y CORS ----
    def cors(self) -> None:
        origin = self.headers.get("Origin", "").rstrip("/")
        if origin and (origin in ORIGENES or "*" in ORIGENES):
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
            self.send_header("Access-Control-Allow-Headers", "X-Familia, Content-Type")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Private-Network", "true")
            self.send_header("Access-Control-Max-Age", "600")

    def send(self, code: int, body: bytes, ctype: str) -> None:
        self.send_response(code)
        self.cors()
        self.send_header("Content-Type", ctype)
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def reply(self, code: int, data) -> None:
        self.send(code, json.dumps(data, ensure_ascii=False).encode(), "application/json; charset=utf-8")

    def authorized(self) -> bool:
        if hmac.compare_digest(self.headers.get("X-Familia", "").encode(), APP_TOKEN.encode()):
            return True
        time.sleep(0.5)  # frena los intentos a ciegas
        self.reply(403, {"error": "Token no válido"})
        return False

    def do_OPTIONS(self):
        self.send_response(204)
        self.cors()
        self.send_header("Content-Length", "0")
        self.end_headers()

    # ---- GET ----
    def do_GET(self):
        if not self.authorized():
            return
        url = urllib.parse.urlsplit(self.path)
        path, q = url.path.rstrip("/"), urllib.parse.parse_qs(url.query)
        try:
            if path == "/api/estado":
                return self.reply(200, {"ok": True, "version": VERSION, "calendarios": len(calendarios()),
                                        "compra": os.path.exists(COMPRA_JSON)})
            if path == "/api/calendarios":
                return self.reply(200, [{k: v for k, v in c.items() if not k.startswith("_")} for c in calendarios()])
            m = re.fullmatch(r"/api/ics/([A-Za-z0-9_-]{1,40})", path)
            if m:
                cal = next((c for c in calendarios() if c["clave"] == m.group(1)), None)
                if not cal:
                    return self.reply(404, {"error": "Ese calendario no existe"})
                return self.send(200, descargar(cal["_url"], ICS_TTL), "text/calendar; charset=utf-8")
            if path == "/api/luz":
                desde, hasta = q.get("desde", [""])[0], q.get("hasta", [""])[0]
                try:
                    d0, d1 = datetime.date.fromisoformat(desde), datetime.date.fromisoformat(hasta)
                except ValueError:
                    return self.reply(400, {"error": "Fechas no válidas (AAAA-MM-DD)"})
                if not 0 <= (d1 - d0).days <= 2:
                    return self.reply(400, {"error": "Como mucho tres días"})
                ree = ("https://apidatos.ree.es/es/datos/mercados/precios-mercados-tiempo-real"
                       f"?start_date={d0}T00:00&end_date={d1}T23:59&time_trunc=hour")
                return self.send(200, descargar(ree, LUZ_TTL, 2 * 1024 * 1024), "application/json; charset=utf-8")
            if path == "/api/compra":
                try:
                    with open(COMPRA_JSON, "rb") as f:
                        return self.send(200, f.read(), "application/json; charset=utf-8")
                except FileNotFoundError:
                    return self.reply(404, {"error": "Todavía no hay lista de la compra en el servidor"})
            return self.reply(404, {"error": "No existe"})
        except Exception as e:  # noqa: BLE001
            return self.reply(502, {"error": mensaje(e)})

    # ---- POST ----
    def do_POST(self):
        if not self.authorized():
            return
        try:
            n = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            n = 0
        if n > MAX_BODY:
            return self.reply(413, {"error": "Petición demasiado grande"})
        try:
            body = json.loads(self.rfile.read(n) or b"{}")
            producto = str(body.get("producto", "")).strip()[:80]
        except (ValueError, AttributeError):
            return self.reply(400, {"error": "JSON no válido"})
        if not BRING:
            return self.reply(404, {"error": "No hay lista de Bring! configurada"})
        if not producto:
            return self.reply(400, {"error": "Falta el producto"})
        try:
            path = self.path.rstrip("/")
            if path == "/api/compra/quitar":
                found = next((i for i in bring_items("needs_action")
                              if familia.clave_texto(i["summary"]) == familia.clave_texto(producto)), None)
                if found is None:
                    return self.reply(409, {"error": "Ya no está en la lista"})
                ha("/api/services/todo/update_item", {"entity_id": BRING, "item": found["uid"], "status": "completed"})
                reexportar()
                return self.reply(200, {"quitado": found["summary"]})
            if path == "/api/compra/anadir":
                mismo = [i for i in bring_items() if familia.clave_texto(i["summary"]) == familia.clave_texto(producto)]
                if any(i["status"] == "needs_action" for i in mismo):
                    return self.reply(200, {"anadido": producto, "ya_estaba": True})
                if mismo:
                    ha("/api/services/todo/update_item", {"entity_id": BRING, "item": mismo[0]["uid"], "status": "needs_action"})
                else:
                    ha("/api/services/todo/add_item", {"entity_id": BRING, "item": producto})
                reexportar()
                return self.reply(200, {"anadido": producto})
            return self.reply(404, {"error": "No existe"})
        except Exception as e:  # noqa: BLE001
            return self.reply(502, {"error": mensaje(e)})


def mensaje(e: Exception) -> str:
    """Error legible para la app, sin detalles internos (rutas, tokens)."""
    if isinstance(e, urllib.error.HTTPError):
        return f"El servicio respondió {e.code}"
    if isinstance(e, urllib.error.URLError):
        return "No se pudo contactar con el servicio"
    return "Error del servidor"


if __name__ == "__main__":
    if not ORIGENES:
        print("AVISO: «api.origenes» está vacío: el navegador no podrá llamar a la API.", file=sys.stderr)
    srv = ThreadingHTTPServer(("127.0.0.1", PUERTO), Handler)
    print(f"API de Casa en http://127.0.0.1:{PUERTO} (orígenes: {', '.join(ORIGENES) or 'ninguno'})", file=sys.stderr)
    srv.serve_forever()
