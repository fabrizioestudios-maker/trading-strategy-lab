# Publicar NEXUS en tu propio servidor

Esta guía deja NEXUS completo en internet: gráficos, indicadores (incluido Smart Money Concepts de LuxAlgo),
replay, probador de estrategias, laboratorio, cuentas con correo o Google y panel de administración, con HTTPS.

## 1. Qué servidor contratar

| Recurso | Mínimo | Recomendado | Por qué |
| --- | --- | --- | --- |
| Memoria | 4 GB | 8 GB | Con los 9 instrumentos cargados la API usa unos 2,2 GB |
| CPU | 2 vCPU | 4 vCPU | El probador y las corridas simulan minuto a minuto |
| Disco | 20 GB | 40 GB SSD | Datos (unos 1,3 GB con cachés), imágenes de Docker y respaldos |
| Sistema | Ubuntu 24.04 LTS | — | Cualquier Linux con Docker sirve |

Sirve un VPS común (Hetzner, DigitalOcean, Contabo, OVH, Vultr…). Hace falta además un **dominio** (o subdominio)
con un registro DNS **A** que apunte a la IP del servidor.

## 2. Preparar el servidor (una vez)

```bash
# Docker y Compose
curl -fsSL https://get.docker.com | sh
# El código
git clone https://github.com/<tu-usuario>/trading-strategy-lab.git nexus && cd nexus
git checkout nexus/rebuild-ux-foundation   # o main, cuando se una
```

## 3. Copiar los datos de mercado

Los datos no están en git (pesan cientos de MB y tienen licencias de terceros). Desde tu computadora, con la carpeta
`data/` del laboratorio:

```bash
rsync -avz --progress data/*.npz data/MANIFIESTO.csv usuario@IP-DEL-SERVIDOR:~/nexus/data/
# en el servidor: la API corre con el usuario 1000 y necesita escribir sus cachés en data/
sudo chown -R 1000:1000 ~/nexus/data
```

## 4. Configurar

```bash
cp .env.example .env
nano .env
```

- `DOMINIO`: por ejemplo `nexus.tudominio.com`.
- `NEXUS_ADMIN_EMAILS`: tu correo. Al registrarte (o entrar con Google) con ese correo quedás como administrador.
- `NEXUS_GOOGLE_CLIENT_ID` (opcional, para «Continuar con Google»):
  1. Entrá a https://console.cloud.google.com/ y creá un proyecto.
  2. «APIs y servicios» → «Pantalla de consentimiento de OAuth»: tipo Externo, nombre NEXUS, tu correo de soporte.
  3. «Credenciales» → «Crear credenciales» → «ID de cliente de OAuth» → «Aplicación web».
  4. En «Orígenes autorizados de JavaScript» poné `https://<tu DOMINIO>`. No hace falta URI de redirección.
  5. Copiá el **ID de cliente** (termina en `.apps.googleusercontent.com`) a `NEXUS_GOOGLE_CLIENT_ID`.
  El ID de cliente es público; NEXUS no usa ni guarda el «secreto del cliente».

`.env` no se sube a git.

## 5. Levantar

```bash
NEXUS_COMMIT=$(git rev-parse HEAD) docker compose up -d --build
docker compose logs -f nexus     # esperar «Uvicorn running»
```

Caddy pide el certificado HTTPS solo (los puertos 80 y 443 tienen que estar abiertos). Entrá a
`https://<tu DOMINIO>`, creá tu cuenta con el correo de `NEXUS_ADMIN_EMAILS` y en la barra lateral aparece **Admin**.

Para dar o quitar el rol de administrador a otra persona: panel **Admin → Usuarios**, o por consola:

```bash
docker compose exec nexus python -m nexus_api.usuarios admin correo@ejemplo.com
```

## 6. Respaldos

Las cuentas, sesiones, corridas y pruebas del probador están en el volumen `nexus_registro`:

```bash
docker run --rm -v nexus_nexus_registro:/r -v "$PWD":/b alpine tar czf /b/respaldo-$(date +%F).tgz -C /r .
```

Guardá ese archivo fuera del servidor. Para restaurar, el mismo comando con `tar xzf` hacia el volumen.

## 7. Actualizar y volver atrás

```bash
git pull
NEXUS_COMMIT=$(git rev-parse HEAD) docker compose up -d --build      # actualizar
git checkout <commit-anterior> && docker compose up -d --build       # volver a la versión anterior
```

Antes de actualizar, hacé un respaldo (punto 6). Las pruebas del proyecto se corren con
`pytest -q tests` (API y motor) y `cd nexus_web && npm test && npm run e2e` (interfaz).

## 8. Seguridad, en resumen

- Contraseñas con scrypt; la sesión es una cookie HttpOnly, SameSite=Lax y solo HTTPS (`NEXUS_COOKIE_SEGURA=1`).
- Intentos fallidos limitados; todo queda en **Admin → Actividad**.
- Caddy agrega HSTS y cabeceras de seguridad.
- Sin `NEXUS_LOGIN=1` la API funciona **sin cuentas** (modo local): no la expongas así a internet. El
  `docker-compose.yml` ya lo deja en 1.

## 9. Licencias a tener en cuenta

- **Smart Money Concepts [LuxAlgo]**: licencia CC BY-NC-SA 4.0, **no comercial**. Si NEXUS se cobra, hay que pedir una
  licencia comercial a LuxAlgo o quitar el indicador (`nexus_api/biblioteca/LICENCIA_LUXALGO.md`).
- **TradingView Lightweight Charts**: Apache 2.0, con la atribución visible debajo de los gráficos.
- **Datos HistData / Dukascopy**: revisá sus términos antes de ofrecer los datos a terceros (`data/README.md`).
