#!/usr/bin/env python3
"""Lista de la compra: Alexa ⇄ Bring! en los dos sentidos (Home Assistant), para poder quitar cosas por voz.

En el servidor lo lanza familia-compra.service cada minuto antes del exportador (compra_export.py). Sustituye a una
automatización «Alexa → Bring!» que borraba de Alexa lo que pasaba a Bring! (y por eso «Alexa, quita…» no encontraba
nada).

La lista de Alexa es un espejo de Bring!. Para distinguir «nuevo» de «quitado» se guarda lo que ya estaba en las dos
(«rutas.compra_sync_estado», nombres normalizados):
- solo en Alexa y no estaba sincronizado → se ha dicho «Alexa, añade…»: se añade a Bring! (mayúscula inicial);
- solo en Alexa y sí lo estaba → se compró o quitó en Bring! (o en el marco): se quita de Alexa;
- solo en Bring! y no estaba sincronizado → añadido en Bring! o en el marco: se añade a Alexa;
- solo en Bring! y sí lo estaba → «Alexa, quita…» (o tachado en Alexa): se marca comprado en Bring! (sigue en sus
  «recientes», por si fue un error).

Además lleva la cuenta de lo que se pide («rutas.compra_frecuentes»): cada producto que entra nuevo en la lista, venga
de Alexa, de Bring! o del marco, suma una vez por día. De ahí salen los «habituales» del marco (compra_export.py).

De config/familia.json: «home_assistant.url», «home_assistant.compra_alexa», «home_assistant.compra_bring» y las rutas.

Uso: python3 -I scripts/compra_sync.py [--dry-run]
"""
from __future__ import annotations

import datetime
import json
import os
import sys
import tempfile
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import familia  # noqa: E402

HA = familia.ha_url()
TOKEN = familia.ha_token()
ALEXA = familia.entidad("compra_alexa")
BRING = familia.entidad("compra_bring")
STATE = familia.ruta("compra_sync_estado", "compra-sync.json")
FREQ = familia.ruta("compra_frecuentes", "compra-frecuentes.json")
DRY = "--dry-run" in sys.argv


def call(path: str, body: dict):
    req = urllib.request.Request(HA + path, data=json.dumps(body).encode(), method="POST",
                                 headers={"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read() or b"null")


def items(entity: str) -> list[dict]:
    return call("/api/services/todo/get_items?return_response", {"entity_id": entity})["service_response"][entity]["items"]


def key(name: str) -> str:
    """«Kétchup», «ketchup » y «KETCHUP» son lo mismo."""
    return familia.clave_texto(name)


def act(service: str, entity: str, **data) -> None:
    print(("[simulación] " if DRY else "") + f"{service} {entity} {data}")
    if not DRY:
        call(f"/api/services/todo/{service}", {"entity_id": entity, **data})


def count(name: str) -> None:
    """Un pedido más de [name] (como mucho uno por día y producto)."""
    if DRY:
        return
    try:
        freq = json.load(open(FREQ))
    except (FileNotFoundError, ValueError):
        freq = {}
    k, today = key(name), datetime.date.today().isoformat()
    e = freq.setdefault(k, {"nombre": name[:1].upper() + name[1:], "dias": []})
    if today not in e["dias"]:
        e["dias"] = (e["dias"] + [today])[-60:]
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(FREQ))
    with os.fdopen(fd, "w") as f:
        json.dump(freq, f, ensure_ascii=False)
    os.replace(tmp, FREQ)


def main() -> None:
    alexa_all, bring_all = items(ALEXA), items(BRING)
    # Lo tachado en Alexa no cuenta (si estaba sincronizado, se quita de Bring! más abajo). Su historial de
    # tachados (compras antiguas) se deja como está: no se borra nada de Alexa que no sea de esta lista viva.
    alexa = {key(i["summary"]): i for i in alexa_all if i["status"] == "needs_action" and i["summary"].strip()}
    bring = {key(i["summary"]): i for i in bring_all if i["status"] == "needs_action" and i["summary"].strip()}
    try:
        synced = set(json.load(open(STATE)))
    except (FileNotFoundError, ValueError):
        synced = set()

    for k in alexa.keys() - bring.keys():
        if k in synced:
            act("remove_item", ALEXA, item=alexa[k]["uid"])
        else:
            name = alexa[k]["summary"].strip()
            # Si ya estaba comprado en Bring!, se vuelve a pedir (Bring! lo saca de recientes)
            done = next((i for i in bring_all if i["status"] == "completed" and key(i["summary"]) == k), None)
            if done:
                act("update_item", BRING, item=done["uid"], status="needs_action")
            else:
                act("add_item", BRING, item=name[:1].upper() + name[1:])
            count(name)
    for k in bring.keys() - alexa.keys():
        if k in synced:
            act("update_item", BRING, item=bring[k]["uid"], status="completed")
        else:
            act("add_item", ALEXA, item=bring[k]["summary"].strip())
            count(bring[k]["summary"].strip())

    # Lo que queda en las dos tras este paso
    now = (alexa.keys() & bring.keys()) | {k for k in alexa.keys() - bring.keys() if k not in synced} \
        | {k for k in bring.keys() - alexa.keys() if k not in synced}
    if not DRY and now != synced:
        fd, tmp = tempfile.mkstemp(dir=os.path.dirname(STATE))
        with os.fdopen(fd, "w") as f:
            json.dump(sorted(now), f, ensure_ascii=False)
        os.replace(tmp, STATE)


if __name__ == "__main__":
    main()
