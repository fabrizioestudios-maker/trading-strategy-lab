# NEXUS: dónde estamos y cómo seguir (traspaso para otro chat)

Última actualización: 28/11/2026. Leer este archivo entero antes de tocar nada. Después: `NEXUS/PROGRESS.md`
(historial), `NEXUS/FUNCIONES.md` (mapa de funciones), `DEPLOY.md` (publicar), `BITACORA.md` (laboratorio).

## 1. Qué es NEXUS y para quién

Plataforma de gráficos y de investigación de trading **de uso personal de Fabrizio** (no se vende; confirmado el
28/11/2026). Objetivo: tener lo máximo posible de TradingView **más** pruebas de estrategias con rigor cuantitativo
(el laboratorio de este repositorio). Fabrizio decide solo permisos («sí / no»); todo lo demás lo decide quien desarrolla.

## 2. Reglas permanentes de Fabrizio (no negociables)

- No publicar claves, tokens ni contraseñas; no mostrarlos en logs, informes ni commits. No pedirle secretos por chat
  (usar el formulario seguro de credenciales).
- No eliminar datos históricos sin respaldo; no sobrescribir producción sin copia.
- No cambiar grupos, destinatarios ni canales de publicación sin verificar sus identificadores.
- No enviar señales de prueba a clientes reales (bot de `senales-vip`).
- No hacer pagos, compras, contrataciones ni cambios de facturación. No tocar saldos ni operar.
- No modificar la estrategia de trading ni niveles de entrada, SL, TP o parámetros estratégicos (E022, bot).
- Antes de cada despliegue: correr las pruebas y tener un procedimiento de reversión.
- Nunca trabajar ni hacer push en `main` sin un «sí» explícito; la rama de trabajo es `nexus/rebuild-ux-foundation`.
- Todo concepto SMC/ICT entra **solo como indicador** (como en TradingView), nunca como capa suelta de NEXUS.
- Los indicadores tienen que ser **idénticos al original** (mismos niveles, misma detección).

## 3. Estado al 28/11/2026

Rama `nexus/rebuild-ux-foundation` (último commit al escribir esto: ver `git log`). Pruebas: pytest NEXUS 61,
Vitest 35, Playwright 11 (todas pasan).

| Parte | Estado | Dónde |
| --- | --- | --- |
| API FastAPI, contrato `nexus.v1`, tipos TS generados | Hecho | `nexus_api/`, `nexus_api/openapi.v1.json`, `nexus_web/src/api/contrato.gen.ts` |
| Replay sin datos futuros (velas, sesiones, niveles, órdenes y cuenta simulada, rango desde/hasta) | Hecho | `nexus_api/datos.py`, `app.py`, `nexus_web/src/modules/replay/` |
| Biblioteca de indicadores: 15 clásicos + Smart Money Concepts [LuxAlgo] (port Python) | Hecho | `nexus_api/biblioteca/` |
| Gráfico: tipos (velas, Heikin Ashi, barras, línea, área), log, dibujo, lista de seguimiento | Hecho | `nexus_web/src/components/GraficoVelas.tsx`, `primitiva*.ts` |
| Probador de estrategias cuantitativo | Hecho | `nexus_api/probador.py`, `nexus_web/src/modules/Probador.tsx` |
| Laboratorio (E022 candidata nivel B, corridas, analítica, robustez) | Hecho | `nexus_api/investigacion.py`, `lab/` |
| Cuentas (correo + Google), sesiones, panel de administración | Hecho | `nexus_api/usuarios.py`, `admin.py`, `nexus_web/src/modules/Admin.tsx`, `Acceso.tsx` |
| Despliegue Docker + HTTPS (Caddy) | Hecho y probado acá | `Dockerfile`, `docker-compose.yml`, `Caddyfile`, `.env.example`, `DEPLOY.md` |
| Versión de muestra (respuestas grabadas) | Publicada | Artifact privado https://claude.ai/artifact/2fZHfU51DGT5riCLTK6XQq ; Space estático privado `FabrizioDalleva/nexus` (versión anterior) |

Datos: 9 instrumentos M1 bid en `data/*.npz` (no versionados; XAUUSD hasta 26/11/2026 con Dukascopy, el resto hasta
13/11/2026 HistData). **No hay datos en vivo todavía.**

## 4. Cómo correr todo

```bash
python3 -m nexus_api --host 127.0.0.1 --puerto 8800          # API + interfaz (sin cuentas, modo local)
NEXUS_LOGIN=1 NEXUS_ADMIN_EMAILS=correo NEXUS_DB=/tmp/u.sqlite python3 -m nexus_api --puerto 8801   # con cuentas
python3 -m nexus_api --sintetico                               # datos sintéticos (pruebas e2e)
cd nexus_web && npm run dev | npm run build | npm test | npm run e2e
python3 -m pytest -q tests/test_nexus_*.py
python3 -m nexus_api.openapi && python3 -m nexus_api.tipos_ts   # después de cambiar contratos.py
# versión de muestra (artifact): ver nexus_web/README.md (grabar → empaquetar → build:estatico)
```

En la nube de Claude Code: Docker se levanta con `dockerd` en segundo plano; para construir la imagen hay que usar un
Dockerfile de prueba que confíe en la CA del proxy (`--build-context ca=/root/.ccr`), nunca cambiar el Dockerfile real.

## 5. Pedido del 28/11/2026 (lo que sigue)

Fabrizio pidió, textual en espíritu:
1. Que **todos los indicadores sean 100 % iguales al original** (mismos niveles, misma detección).
2. Que la plataforma **reproduzca el gráfico en vivo**.
3. **Importar todas las librerías** de LuxAlgo, TradingView, FluxCharts y Algoryze.
4. Incorporar **lo máximo posible de TradingView**.
5. Anotar todo para seguir desde otro chat (este archivo).

### Plan acordado (en este orden)

**Fase A — Motor de Pine Script dentro de NEXUS (la base de todo lo demás).** ✅ Prueba de concepto superada el 28/11/2026 con PineTS: ver `NEXUS/pine_runtime/README.md`.
Portar a mano 850+ indicadores no es viable ni garantiza igualdad. La forma de lograr «100 % igual» es ejecutar el
**código Pine original** dentro de NEXUS:
- Candidatos: **PineTS** (npm `pinets` 0.13.1, AGPL-3.0, transpila y corre Pine en el navegador/Node) y **PyneCore**
  (pip `pynesys-pynecore` 6.16.0, runtime Python de Pine v6). AGPL y uso personal: sin problema.
- Primer paso: correr con PineTS el Pine original de Smart Money Concepts (`pine/terceros/luxalgo_smart_money_concepts.pine`)
  y comparar contra el port Python (`nexus_api/biblioteca/luxalgo_smc.py`) vela por vela.
- Falta verificar: soporte de `label/line/box`, `request.security`, `varip`, tipos (`type`), `array/map`, tablas.
  Lo que falte se implementa en NEXUS (dibujos ya existen: `primitivaIndicadores.ts`).
- **Prueba de paridad obligatoria por indicador:** mismos valores/niveles que TradingView (o Vela de LuxAlgo) en un tramo
  de referencia. Referencias posibles: exportar desde TradingView (cuenta de Fabrizio) o leer el gráfico de Vela con el
  conector de LuxAlgo (`vela_read_chart`, a confirmar). Sin esa prueba, un indicador no se marca «idéntico».
- Advertencia: las velas tienen que ser las mismas que las del original (mismo proveedor y zona horaria); si no, los
  valores difieren aunque el código sea idéntico. NEXUS usa bid de HistData/Dukascopy; TradingView usa el feed del bróker.

**Fase B — Importar las librerías.**
- **LuxAlgo:** 853 indicadores en la Biblioteca (conector `mcp__luxalgo__library_*`, código con
  `library_get_source_code`; algunos piden sesión de LuxAlgo para el código completo). Guardar cada fuente en
  `pine/terceros/luxalgo/<slug>.pine` con su licencia y autor; registrar en un catálogo. Hacerlo por lotes.
- **TradingView:** los indicadores incorporados («built-ins»: medias, RSI, MACD, Ichimoku, VWAP, Volume Profile…) tienen
  su código Pine visible en el editor; los scripts de la comunidad, solo los de código abierto, cada uno con su licencia.
- **FluxCharts y Algoryze:** la mayoría son pagos y protegidos (código oculto): **no se pueden importar**. Solo los
  gratuitos de código abierto. Confirmar caso por caso; nunca intentar saltar protecciones.

**Fase C — Datos en vivo.**
Necesita un proveedor con API (decisión y cuenta de Fabrizio; la clave se pide con el formulario seguro, nunca por chat):
- XAUUSD y forex: OANDA (cuenta demo gratis, streaming de precios con token), Twelve Data o Finnhub (planes gratis con
  límites), Dukascopy no tiene API oficial en vivo.
- Cripto: Binance (websocket público, gratis, sin clave).
- Diseño: servicio de velas en vivo en la API (websocket hacia la interfaz), velas de 1 minuto que se agregan igual que
  el histórico, y el gráfico pasa de «replay» a «vivo».

**Fase D — Más TradingView.**
Varios gráficos por pantalla, alertas (precio e indicador), guardar gráficos/dibujos/estrategias en la cuenta del
servidor, más tipos de gráfico (Renko, Kagi, Line break), volumen si el proveedor lo da, screener, calendario y noticias
(proveedor), editor de Pine (que sale casi gratis con la Fase A).

## 6. Decisiones de Fabrizio (28/11/2026)

1. **Datos en vivo: OANDA** (cuenta demo gratis). Fabrizio crea la cuenta; el token se pide con el formulario seguro
   (`request_credential`, host `api-fxpractice.oanda.com` y `stream-fxpractice.oanda.com`), nunca por chat.
2. **LuxAlgo:** Fabrizio puede crear una cuenta para acceder al código completo de la Biblioteca.
3. **Importar todo lo importable** de LuxAlgo, TradingView, FluxCharts y Algoryze («más datos = mejores resultados»).
4. **Misión del laboratorio (sin cambios):** estrategia de scalping con RR 1:2 y acierto ≥ 50 % en los últimos 5 años,
   usando todos los indicadores y parámetros; con los parámetros encontrados se arma el EA y se pone a operar.
   Condiciones que no se negocian: cada búsqueda cuenta sus pruebas (Deflated Sharpe / pruebas múltiples), validación
   fuera de muestra y prueba a futuro en demo antes de cualquier dinero real; operar con dinero real necesita un «sí»
   explícito de Fabrizio (regla: no ejecutar operaciones financieras). Antecedente: F7 ya buscó WR ≥ 50 % con RR 1:2 en
   5 años y nada pasó los controles (ver BITACORA.md).

## 6b. Decisiones pendientes (antiguas, ya respondidas arriba)

1. **Proveedor de datos en vivo** (y crear la cuenta): OANDA demo es la opción gratis más completa para XAUUSD.
2. ¿Tiene cuenta de LuxAlgo? Algunas fuentes completas de la Biblioteca piden sesión.
3. ¿Qué indicadores de FluxCharts/Algoryze usa? Para revisar si alguno es de código abierto.

## 7. Detalles técnicos que conviene saber

- El replay nunca usa datos posteriores al límite; cada capa nueva necesita su prueba de prefijo (ver
  `tests/test_nexus_indicadores.py`).
- Los indicadores de estado (SMC) se calculan solo con velas cerradas; los clásicos incluyen la vela en formación.
- `NEXUS_LOGIN=1` activa cuentas; sin eso la API corre como administrador local (no exponer así a internet).
- El probador cuenta cada configuración distinta por usuario (`registro/nexus/probador/`) para el Deflated Sharpe.
- La versión de muestra lee `instantanea/<último carácter de la clave>.json`; la clave es cyrb53 del método, ruta y
  cuerpo (`nexus_web/src/api/clave.ts`).
- Lab: E022 es la única candidata (nivel B), le faltan las pruebas a futuro F001/F002 (desde 27/11/2026 22:00 UTC; las
  actualiza una tarea mensual).
