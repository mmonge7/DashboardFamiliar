# Casa: panel familiar para iPad y móvil 🏠

Una app para tener **la casa de un vistazo**: el calendario de toda la familia (también los de Apple), el **menú**
de comida y cena, lo que cuesta **la luz con tu tarifa** y las mejores horas para cargar el coche o poner el
lavavajillas, y la **lista de la compra** compartida. Pensada para un **iPad colgado en la pared**, y también para el iPhone o el Android
de cada uno.

Es una **web app instalable (PWA)**: se abre en Safari y se añade a la pantalla de inicio. **Sin App Store, sin Mac,
sin cuenta de desarrollador y sin ningún coste.** La misma app sirve en iPad, iPhone y Android.

| | |
|---|---|
| ![Hoy en el iPad](docs/capturas/ipad-hoy.png) **Hoy** | ![Precio de la luz](docs/capturas/ipad-luz.png) **Luz** |
| ![Menú de la semana](docs/capturas/ipad-menu.png) **Menú** | ![Calendario de pared](docs/capturas/ipad-calendario.png) **Calendario de pared** |
| ![Compra y tareas](docs/capturas/ipad-compra.png) **Compra y tareas** | |

<p align="center"><img src="docs/capturas/iphone-hoy.png" width="240" alt="Hoy en el iPhone, modo oscuro"> <img src="docs/capturas/iphone-menu.png" width="240" alt="Menú en el iPhone, modo oscuro"> <img src="docs/capturas/iphone-luz.png" width="240" alt="Luz en el iPhone, modo oscuro"></p>

> Las capturas usan los datos de ejemplo que trae la app mientras no está conectada: nombres, citas y platos inventados.

## Qué hace

- **Hoy:** una franja de cielo que cambia de color con el sol (con la hora, la fecha y el tiempo de 7 días), lo
  próximo en el calendario con cuenta atrás, la semana entera con el menú del cole, el precio de la luz de ahora y lo
  que falta en la compra.
- **Calendario de pared:** cinco semanas de lunes a domingo con el tiempo de cada día. Tocar una cita enseña el
  detalle.
- **Menú:** la comida y la cena de cada día de la semana; se toca un día para escribirlo (sugiere platos ya usados).
  En «Hoy» aparece el menú del día y, por la tarde, la comida de mañana.
- **Luz:** con **tu tarifa** (precio único, tres tramos o PVPC): lo que pagas ahora con impuestos, cuándo cambia de
  tramo, las mejores horas para cada aparato y lo que cuesta. Trae ya rellenas Repsol (precio único), Nufri e
  Iberdrola, y el PVPC del día como referencia.
- **Compra y tareas:** tocar un producto lo tacha, se puede deshacer, se añaden productos y los habituales están a un
  toque. Con el servidor de casa, además, se sincroniza con Bring!, Alexa y Todoist.
- **De noche** se queda en un reloj tenue; funciona **sin conexión** con la última copia y mantiene la pantalla
  encendida.

## Cómo funciona

```
 iPad / iPhone / Android                              Equipo de casa siempre encendido (opcional)
 ───────────────────────                              ───────────────────────────────────────────
 App «Casa» (GitHub Pages) ──── Tailscale (privado) ───▶ servidor/ : API + Home Assistant
   │                                                      ├─ Google Calendar (iCal secreto)
   ├─▶ Open-Meteo (tiempo, directo)                       ├─ Bring!, Todoist, Alexa (compra y tareas)
   └─▶ Red Eléctrica (precio de la luz, directo)          └─ Red Eléctrica (por si el navegador no llega)
```

- **Sin conexión** la app ya enseña el tiempo y la luz con tu tarifa; el calendario es de ejemplo y el menú y la
  compra se guardan solo en ese dispositivo.
- **Con Cloudflare (gratis, sin aparatos):** tus calendarios de Apple o Google, y el menú y la compra compartidos
  entre todos los dispositivos. Guía: [`cloudflare/README.md`](cloudflare/README.md).
- **Con el servidor de casa (opcional, más adelante):** lo mismo más Alexa, Bring!, Todoist y aparatos mediante Home
  Assistant, en un equipo siempre encendido. Guía: [`servidor/README.md`](servidor/README.md).

## Puesta en marcha

### 1. Publicar la app (una vez)

En este repositorio de GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**. El flujo
[`.github/workflows/pages.yml`](.github/workflows/pages.yml) publica la carpeta `app/` en cada cambio. La app queda en:

**https://mmonge7.github.io/DashboardFamiliar/**

### 2. Instalarla en el iPad o el iPhone

1. Abre esa dirección en **Safari**.
2. Toca **Compartir → Añadir a pantalla de inicio**. Se abre a pantalla completa, con su icono, como cualquier app.
3. En **Ajustes** (dentro de la app) elige tu municipio para el tiempo y ajusta los aparatos de «mejores horas».

En Android: Chrome → menú → **Instalar aplicación**.

### 3. El iPad como panel de pared

- **Acceso Guiado:** Ajustes del iPad → Accesibilidad → Acceso Guiado → activar. Con la app abierta, pulsa tres veces
  el botón lateral (o el de inicio) y empieza: el iPad se queda fijo en la app.
- **Que no se apague:** Ajustes → Pantalla y brillo → Bloqueo automático → Nunca (y deja el iPad cargando).
- La app oscurece la pantalla de noche (horario en Ajustes de la app); tocarla la despierta un minuto.

### 4. Tu tarifa de la luz

En **Ajustes → Tu tarifa de la luz** elige la tuya (o escribe los precios de tu factura, sin impuestos).

### 5. Conectar tus calendarios de Apple, el menú y la compra

Sigue [`cloudflare/README.md`](cloudflare/README.md): unos 15 minutos, gratis y sin aparatos.

## Estructura

```
app/                 La app (HTML, CSS y JavaScript sin compilar; se publica tal cual)
├── index.html, manifest.webmanifest, sw.js   página, instalación y modo sin conexión
├── js/data/         calendario (ical.js), luz (REE) y tarifa, tiempo (Open-Meteo), menú, compra
├── js/views/        Hoy, Calendario, Menú, Luz, Compra, Ajustes
├── vendor/          ical.js (MPL-2.0)
└── fonts/           Bricolage Grotesque y Atkinson Hyperlegible (OFL)
cloudflare/          Worker gratuito: calendarios de Apple/Google, menú y compra compartidos
servidor/            Alternativa en casa: API, Home Assistant, Docker y Tailscale
docs/capturas/       capturas del README
```

Para probarla en el ordenador: `cd app && python3 -m http.server 8000` y abre `http://localhost:8000`.

## Privacidad

- Nada de la familia está en este repositorio: la configuración real y los secretos están en el servidor, ignorados
  por git (`.gitignore`), y los ajustes de cada dispositivo se guardan solo en ese dispositivo.
- La dirección de la conexión y el token se escriben a mano en Ajustes; no van en la app publicada.
- Los enlaces de los calendarios se guardan como secretos en Cloudflare (o en el servidor de casa), nunca en la app.

## Créditos y licencia

Licencia **MIT**, como el proyecto del que parte. Es una adaptación a web app (iPad, iPhone y Android) de
[**leontdi/marco-familiar-dashboard**](https://github.com/leontdi/marco-familiar-dashboard), que a su vez evoluciona
[**eusonlito/Planify-Dashboard**](https://github.com/eusonlito/Planify-Dashboard), inspirado en
[**wesbos/photo-frame-dashboard**](https://github.com/wesbos/photo-frame-dashboard). Del proyecto de leontdi se
reutilizan la idea de las pantallas, el cálculo de las mejores horas de la luz y los scripts de la compra
(`compra_sync.py`, `compra_export.py`, `familia.py`).

Terceros: [ical.js](https://github.com/kewisch/ical.js) (MPL-2.0, `app/vendor/`), las fuentes Bricolage Grotesque y
Atkinson Hyperlegible (SIL OFL 1.1, `app/fonts/`), [Open-Meteo](https://open-meteo.com) (datos del tiempo, CC BY 4.0),
[Red Eléctrica](https://www.ree.es/es/apidatos) (precio de la luz) y [Home Assistant](https://www.home-assistant.io).
