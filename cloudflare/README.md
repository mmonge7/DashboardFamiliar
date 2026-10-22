# Conectar la app sin aparatos: calendarios de Apple, menú y compra

Sin conexión, la app ya enseña el tiempo y la luz, pero el calendario es de ejemplo y el menú y la compra se guardan
solo en el dispositivo donde los escribes. Con esta conexión:

- ves **tus calendarios de Apple (iCloud)**, y también los de Google si los tienes;
- el **menú** y la **lista de la compra** se comparten entre el iPad y los móviles de la familia.

Funciona con un **Worker de Cloudflare**: un pequeño programa que Cloudflare ejecuta gratis en su nube. No hace falta
ningún aparato en casa ni pagar nada. El plan gratuito permite 100.000 peticiones al día; la app hace unas pocas
decenas por dispositivo cada hora.

## Por qué hace falta este paso

Safari no deja que una web lea directamente los calendarios de iCloud, y la app no puede guardar nada compartido por
sí sola. El Worker hace de intermediario: lee tus calendarios, guarda el menú y la compra, y solo responde a quien
tenga tu **token** (una contraseña larga que solo conocen tus dispositivos).

## 1. Saca el enlace de cada calendario de Apple

Un enlace por cada calendario que quieras ver en la app.

**En el iPhone o el iPad:**

1. Abre **Calendario** y toca **Calendarios** (abajo).
2. Toca la **ⓘ** junto al calendario (por ejemplo «Familia»).
3. Activa **Calendario público**.
4. Toca **Compartir enlace…** → **Copiar**. Empieza por `webcal://p…-caldav.icloud.com/published/…`.

**En el Mac:** app Calendario → clic derecho sobre el calendario → **Compartir calendario…** → marca **Calendario
público** → copia la dirección.

> Quien tenga ese enlace puede ver ese calendario (no modificarlo). Por eso solo lo guardas en Cloudflare como
> secreto: ni la app ni el repositorio lo conocen. Si un día se filtra, desactiva «Calendario público» y vuelve a
> activarlo: el enlace cambia.

Los cambios que hagas en el calendario tardan unos minutos en verse en la app (iCloud actualiza el enlace público con
algo de retraso).

## 2. Crea la cuenta y el Worker

1. Crea una cuenta gratuita en [dash.cloudflare.com](https://dash.cloudflare.com/sign-up). No pide tarjeta.
2. En el menú: **Workers & Pages → Create → Start with Hello World!**. Ponle de nombre `casa` y pulsa **Deploy**.
3. Pulsa **Edit code**, borra lo que hay, pega el contenido de [`worker.js`](worker.js) y pulsa **Deploy**.
4. Apunta la dirección del Worker: algo como `https://casa.tu-nombre.workers.dev`.

## 3. Dale un sitio para guardar el menú y la compra

1. En el menú: **Storage & databases → Workers KV → Create**, con el nombre `casa`.
2. Vuelve al Worker `casa` → **Bindings → Add binding → KV namespace**.
3. Variable name: `CASA` (en mayúsculas). KV namespace: `casa`. Guarda.

## 4. Configura el token, la web de la app y tus calendarios

En el Worker `casa` → **Settings → Variables and Secrets → Add**:

| Tipo | Nombre | Valor |
|---|---|---|
| Secret | `APP_TOKEN` | Un token largo. Genéralo en la app: **Ajustes → Generar un token nuevo** (se copia solo). |
| Text | `ORIGENES` | `https://mmonge7.github.io` |
| Secret | `CAL_Familia` | El enlace `webcal://…` del calendario Familia |
| Secret | `CAL_Marcos` | El enlace de otro calendario (uno por variable) |

- El nombre del calendario en la app es lo que va detrás de `CAL_` (los guiones bajos se convierten en espacios).
- Para elegir el color: `#E8604C;webcal://…`. Para un calendario de menú del cole: `#2E8B6A;menu;webcal://…`.
- Pulsa **Deploy** (o **Save and deploy**) después de añadirlas.

## 5. Conecta la app

En cada dispositivo: app **Casa → Ajustes → Conexión**:

1. **Dirección:** la del Worker (`https://casa.tu-nombre.workers.dev`).
2. **Token:** el mismo `APP_TOKEN`. En el dispositivo donde lo generaste ya está escrito; en los demás, pégalo (por
   ejemplo con el portapapeles universal de Apple o mandándotelo por una nota privada).
3. **Probar conexión** → debe decir «Conectado con Cloudflare: N calendarios, menú compartido, lista de la compra».
4. **Guardar ajustes**.

## 6. Crear eventos desde la app (opcional)

Para que los eventos que creas en la app se guarden en tu calendario de Apple, el Worker necesita permiso para
escribir en iCloud. Ese permiso es una **contraseña de aplicación**: no es tu contraseña de Apple, solo sirve para
esto y la puedes revocar cuando quieras.

1. Entra en [account.apple.com](https://account.apple.com) con tu Apple ID.
2. **Inicio de sesión y seguridad → Contraseñas de aplicación → +** (o «Generar contraseña»). Ponle de nombre «Casa».
3. Copia la contraseña que te da (del tipo `abcd-efgh-ijkl-mnop`). Apple solo la enseña una vez.
4. En Cloudflare, en el Worker `casa` → **Settings → Variables and Secrets → Add**:

| Tipo | Nombre | Valor |
|---|---|---|
| Secret | `ICLOUD_Marcos` | `tu-apple-id@correo.com;abcd-efgh-ijkl-mnop` (correo, punto y coma, contraseña) |

5. Para otra cuenta de Apple (tu pareja, por ejemplo), esa persona crea su propia contraseña de aplicación y se añade
   otra variable: `ICLOUD_Ana`.

En la app, **Calendario → + Nuevo evento** (o toca el hueco de un día) te deja elegir en qué calendario de qué cuenta
se guarda y su **tipología**. El evento aparece al momento en la app y en unos segundos en todos los dispositivos
Apple de esa cuenta.

Los eventos **creados desde la app** se pueden **editar y borrar** desde la app (tócalos en el calendario), y la app
los consulta directamente a iCloud: si los cambias o borras en el iPhone, la app lo ve al actualizar. Los que vienen
del iPhone son de **solo lectura** en la app (salvo su tipología).

> Con una contraseña de aplicación también se podría leer el correo y los contactos de esa cuenta de iCloud. El
> Worker solo la usa para el calendario y la guarda cifrada como secreto. Si la revocas en account.apple.com, la app
> deja de poder crear eventos, pero sigue enseñándolos.

## Tipologías

En **Ajustes → Tipologías de los eventos** creas las tuyas (Común, Personal, Trabajo, Bebé…) con su color, y eliges la
que lleva por defecto cada calendario. Cada evento, venga de donde venga, puede tener la suya: tócalo en el
calendario y cámbiala. Se guardan en Cloudflare y las ve toda la familia. En el calendario puedes colorear por
tipología o por calendario, y ocultar una tipología tocándola en la leyenda.

En esa misma pantalla, en **Calendarios**, puedes cambiar el **color** con el que se ve cada calendario en la app (el
del iPhone no cambia). «Original» vuelve al color que tiene en Apple. Los colores también se comparten.

## Si algo falla

| Lo que ves | Qué hacer |
|---|---|
| «Token no válido» | El token de la app y `APP_TOKEN` no coinciden. Vuelve a pegarlo. |
| «Sin conexión con el servidor» | Revisa la dirección y que `ORIGENES` sea exactamente `https://mmonge7.github.io`. |
| Un calendario «respondió 404» | Ya no es público o el enlace cambió: vuelve a copiarlo (paso 1). |
| «Falta enlazar el espacio KV» | Revisa el paso 3: el nombre de la variable debe ser `CASA`. |
| «iCloud no acepta la contraseña de aplicación» | Revisa `ICLOUD_…`: correo del Apple ID, punto y coma y la contraseña de aplicación (no la tuya). |
| No sale un calendario al crear un evento | Los compartidos contigo solo para ver no se pueden usar. Si lo acabas de crear, espera unos minutos. |

## Qué guarda y quién lo ve

- **En Cloudflare:** el token, los enlaces de los calendarios y las contraseñas de aplicación (como secretos), el menú
  de los últimos 6 meses, la lista de la compra y las tipologías. Nada más.
- **El Worker solo responde a peticiones con el token**, y el navegador solo deja usarlo desde la web de la app.
- Si cambias de opinión: borra el Worker y el espacio KV en Cloudflare, y desactiva «Calendario público» en Apple.

## Y el servidor de casa

Sigue siendo una opción (ver [`servidor/README.md`](../servidor/README.md)) si más adelante quieres conectar Alexa,
Bring!, Todoist u otros aparatos de casa mediante Home Assistant. Usa la misma API: basta con cambiar la dirección y
el token en Ajustes.
