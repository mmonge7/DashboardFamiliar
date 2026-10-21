#!/usr/bin/env python3
"""Configuración común de los scripts del servidor (un único JSON para todos).

Se busca, por este orden:
1. la ruta de la variable de entorno FAMILIA_CONFIG;
2. `familia.json` en $CREDENTIALS_DIRECTORY (servicios de systemd que la reciben con LoadCredential=);
3. `config/familia.json` junto a la carpeta scripts/.

Parte de `config/familia.example.json`. Las claves que empiezan por «_» son comentarios y no se leen. Los secretos
(tokens, PIN, direcciones iCal, IDs de calendarios) no van en este JSON, sino en ficheros aparte con chmod 600.

Uso desde otro script de esta carpeta (con `python3 -I` el directorio del script no está en sys.path):

    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import familia
    cfg = familia.config()
"""
from __future__ import annotations

import json
import os
import unicodedata

# La carpeta que contiene scripts/ (y, por defecto, config/, secrets/, menus/…)
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_cfg: dict | None = None


def ruta_config() -> str:
    if os.environ.get("FAMILIA_CONFIG"):
        return os.environ["FAMILIA_CONFIG"]
    cred = os.environ.get("CREDENTIALS_DIRECTORY")
    if cred and os.path.exists(os.path.join(cred, "familia.json")):
        return os.path.join(cred, "familia.json")
    return os.path.join(ROOT, "config", "familia.json")


def config() -> dict:
    """El JSON de configuración (se lee una vez por proceso)."""
    global _cfg
    if _cfg is None:
        path = ruta_config()
        try:
            with open(path, encoding="utf-8") as f:
                _cfg = json.load(f)
        except FileNotFoundError:
            raise SystemExit(f"ERROR: falta la configuración {path} (copia config/familia.example.json como "
                             "config/familia.json, o indica otra con FAMILIA_CONFIG)") from None
    return _cfg


def base() -> str:
    """Carpeta de trabajo: «rutas.base» de la configuración o, si no está, la que contiene scripts/."""
    return config().get("rutas", {}).get("base") or ROOT


def ruta(clave: str, defecto: str | None = None) -> str:
    """Ruta «rutas.<clave>» de la configuración; las relativas se toman desde base()."""
    v = config().get("rutas", {}).get(clave) or defecto
    if not v:
        raise SystemExit(f"ERROR: falta «rutas.{clave}» en {ruta_config()}")
    return v if os.path.isabs(v) else os.path.normpath(os.path.join(base(), v))


def leer(path: str) -> str:
    """Contenido de un fichero de secreto (token, PIN…), sin espacios ni saltos de línea alrededor."""
    with open(path, encoding="utf-8") as f:
        return f.read().strip()


def zona() -> str:
    return config().get("zona_horaria", "Europe/Madrid")


def ha() -> dict:
    """Bloque «home_assistant» (URL y entidades de las listas)."""
    return config().get("home_assistant", {})


def ha_url() -> str:
    return ha().get("url", "http://127.0.0.1:8123").rstrip("/")


def ha_token() -> str:
    """Token de larga duración de Home Assistant (fichero «rutas.ha_token»)."""
    return leer(ruta("ha_token", "ha.token"))


def entidad(clave: str) -> str:
    """Entidad «home_assistant.<clave>» (p. ej. compra_bring); error claro si falta."""
    v = ha().get(clave)
    if not v:
        raise SystemExit(f"ERROR: falta «home_assistant.{clave}» en {ruta_config()}")
    return v


def es_altavoz(entity_id: str) -> bool:
    """Si [entity_id] es uno de los reproductores de Alexa Media Player que el marco puede ver y manejar.

    Con «casa.musica.altavoces» (lista no vacía), solo esos; si no, los «media_player.» que acaben en el sufijo
    configurado (Alexa Media Player añade «_2» cuando ya existía una entidad con ese nombre)."""
    m = config().get("casa", {}).get("musica", {})
    if "/" in entity_id or not entity_id.startswith("media_player."):
        return False
    if m.get("altavoces"):
        return entity_id in m["altavoces"]
    return entity_id.endswith(m.get("sufijo", ""))


def clave_texto(s: str) -> str:
    """Texto normalizado para comparar: sin tildes, en minúsculas y con los espacios simplificados."""
    t = unicodedata.normalize("NFKD", s.strip().lower())
    return " ".join("".join(c for c in t if not unicodedata.combining(c)).split())
