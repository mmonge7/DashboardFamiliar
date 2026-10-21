# Servidor de Casa

La app funciona sola con datos de ejemplo, el tiempo y el precio de la luz. Para ver **tus calendarios** y **tu lista
de la compra** necesita este pequeño servidor, que corre en un equipo de casa siempre encendido y hace tres cosas:

1. **Guarda los secretos.** Las direcciones iCal secretas de Google Calendar y los tokens se quedan aquí; ni la app
   ni el repositorio los conocen.
2. **Hace de puente.** Google Calendar no deja que un navegador lea el iCal directamente; el servidor lo descarga y se
   lo pasa a la app. Lo mismo con Red Eléctrica si el navegador no llega.
3. **Conecta con Home Assistant**, que a su vez habla con Bring!, Todoist y Alexa para la compra y las tareas.

Todo es gratis: Home Assistant y este código son libres, y Tailscale (la red privada para llegar desde el iPad) tiene
plan personal gratuito. **Nada se abre a Internet.**

```
 iPad / iPhone (app en Safari)                     Equipo de casa (Raspberry Pi, PC viejo, mini PC…)
 ─────────────────────────────                     ─────────────────────────────────────────────────
                                   Tailscale        tailscale serve (HTTPS)
  Casa ── X-Familia: token ──────  red privada ───▶   └─ 127.0.0.1:8125  casa-api  ──▶ Google Calendar (iCal)
                                                                              │   └──▶ Red Eléctrica (PVPC)
                                                                              └─ estado/compra.json
                                                     casa-compra (cada minuto) ──┘
                                                         │  compra_sync: Alexa ⇄ Bring!
                                                         ▼  compra_export: listas → compra.json
                                                     127.0.0.1:8123  Home Assistant ──▶ Bring!, Todoist, Alexa
```

## Contenido

```
servidor/
├── compose.yaml                     Home Assistant + casa-api + casa-compra (Docker)
├── api/familia_api.py               API de la app (token, CORS, solo 127.0.0.1)
├── scripts/
│   ├── familia.py                   lee config/familia.json (del proyecto original)
│   ├── compra_sync.py               espejo Alexa ⇄ Bring! de la lista de la compra (del proyecto original)
│   └── compra_export.py             Home Assistant → estado/compra.json (del proyecto original)
├── config/familia.example.json      configuración de ejemplo
├── secretos/calendarios.properties.example
└── despliegue/
    ├── compra_loop.sh               bucle de cada minuto de casa-compra
    └── home-assistant/configuration.example.yaml
```

## Qué equipo usar

Cualquier cosa con Linux que esté siempre encendida: una **Raspberry Pi 4 o 5**, un **portátil o PC viejo**, un
**mini PC**. Consume poco (una Raspberry Pi gasta unos pocos vatios). Si no tienes ninguno, la capa gratuita de
**Oracle Cloud** también sirve para calendarios y compra (lo que va por la nube), aunque no para aparatos de tu red
local.

## Instalación paso a paso

Los comandos son para Raspberry Pi OS / Debian / Ubuntu, con un usuario normal (uid 1000).

### 1. Docker y Tailscale

```sh
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER        # cierra sesión y vuelve a entrar
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up                    # abre el enlace y entra con tu cuenta
```

En la consola de Tailscale (login.tailscale.com → DNS) activa **MagicDNS** y **HTTPS Certificates**. Tu equipo tendrá
un nombre del tipo `servidor.tu-red.ts.net`.

### 2. El código y la configuración

```sh
git clone https://github.com/mmonge7/DashboardFamiliar.git
cd DashboardFamiliar/servidor
cp config/familia.example.json config/familia.json
cp config/compra-ignorar.example.txt config/compra-ignorar.txt
mkdir -p estado homeassistant
```

Edita `config/familia.json`: los calendarios que quieres ver (nombre y color) y, en `api.origenes`, la dirección de
tu app en GitHub Pages (por defecto `https://mmonge7.github.io`).

### 3. Los secretos (cada uno en su fichero, `chmod 600`, nunca en git)

```sh
umask 077
openssl rand -hex 32 > secretos/app.token              # el token que pondrás en la app
cp secretos/calendarios.properties.example secretos/calendarios.properties
nano secretos/calendarios.properties                   # pega las direcciones iCal secretas
```

La dirección iCal secreta de cada calendario está en Google Calendar, **desde el ordenador**: Configuración → elige el
calendario → *Integrar el calendario* → *Dirección secreta en formato iCal*. Quien tenga esa dirección puede leer el
calendario: por eso vive solo aquí.

### 4. Home Assistant

```sh
docker compose up -d homeassistant
```

Cuando arranque (un par de minutos), añade el contenido de `despliegue/home-assistant/configuration.example.yaml` a
`homeassistant/configuration.yaml` y reinícialo (`docker compose restart homeassistant`). Así escucha solo en
`127.0.0.1`. Para abrirlo desde tu ordenador o tu móvil (con Tailscale conectado):

```sh
sudo tailscale serve --bg --https=8443 http://127.0.0.1:8123
```

Entra en `https://servidor.tu-red.ts.net:8443`, crea tu usuario y añade las integraciones que uses
(Ajustes → Dispositivos y servicios):

- **Bring!** para la lista de la compra (la que se tacha desde la app).
- **Todoist** si quieres ver las tareas de casa.
- **Alexa Media Player** (desde HACS) si quieres que «Alexa, añade leche» llegue a la lista.

Después, en tu perfil de Home Assistant → Seguridad → *Tokens de acceso de larga duración*, crea uno y guárdalo:

```sh
printf '%s' 'EL-TOKEN-DE-HOME-ASSISTANT' > secretos/ha.token
```

En Herramientas para desarrolladores → Estados busca los nombres de tus listas (`todo.…`) y ponlos en
`home_assistant` de `config/familia.json`. Si no usas Alexa, deja `compra_alexa` vacío.

### 5. Arrancar todo y publicar la API en tu red privada

```sh
docker compose up -d
sudo tailscale serve --bg http://127.0.0.1:8125
```

La API queda en `https://servidor.tu-red.ts.net`, accesible solo desde tus dispositivos de Tailscale. Compruébalo:

```sh
curl -H "X-Familia: $(cat secretos/app.token)" https://servidor.tu-red.ts.net/api/estado
# {"ok": true, "version": "1.0", "calendarios": 2, "compra": true}
```

### 6. En el iPad y los móviles

1. Instala **Tailscale** desde la App Store y entra con la misma cuenta. Déjalo conectado (activa *VPN a petición*
   para que se conecte solo).
2. Abre la app de Casa → **Ajustes** → pon la dirección `https://servidor.tu-red.ts.net` y el contenido de
   `secretos/app.token` → **Probar conexión** → **Guardar ajustes**.

## Mantenimiento

- **Actualizar:** `git pull && docker compose pull && docker compose up -d`.
- **Ver errores:** `docker compose logs -f casa-api casa-compra`.
- **Copia de seguridad:** guarda `config/`, `secretos/` y `homeassistant/`.
- Si cambias `config/familia.json`: `docker compose restart casa-api casa-compra`.

## Seguridad

- **Nada abierto a Internet.** Home Assistant y la API escuchan en `127.0.0.1`; solo los dispositivos de tu cuenta de
  Tailscale llegan, y con HTTPS.
- **Token en cada petición** (`X-Familia`, comparado en tiempo constante, con una pausa tras cada fallo). Si un
  dispositivo se pierde: crea otro token y cámbialo en los demás.
- **CORS** limitado a la dirección de tu app (`api.origenes`).
- La API solo hace lo que está en la lista: leer calendarios configurados, leer la compra, tachar o añadir un producto
  (máximo 80 caracteres) en Bring!. Nunca expone Home Assistant.
- El contenedor de la API es de solo lectura, sin root, y solo puede escribir en `estado/`.

## Limitaciones conocidas

- `compra_sync.py` y `compra_export.py` vienen del proyecto original tal cual; si en tu Home Assistant las listas se
  llaman distinto, basta con cambiar los nombres en `config/familia.json`.
- Lo que se cambia directamente en Bring! o Alexa tarda hasta un minuto en verse en la app (lo que se cambia desde la
  app se ve al momento).
- Google tarda a veces varios minutos en actualizar la dirección iCal tras un cambio en el calendario; además, la app
  y el servidor guardan una copia de 5–10 minutos.
