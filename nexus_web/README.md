# NEXUS · interfaz

Interfaz del terminal de investigación NEXUS: React 18 + TypeScript + Vite, servida por la API (`nexus_api`) desde `nexus_web/dist`.

## Usar NEXUS

```bash
pip install -r requirements.txt -r nexus_api/requirements.txt   # en la raíz del repositorio
cd nexus_web && npm ci && npx vite build && cd ..
python -m nexus_api                                              # http://127.0.0.1:8800
```

Sin `data/` (no está en git) la API responde «faltan los datos» con instrucciones. Para ver la interfaz sin datos reales:
`python -m nexus_api --sintetico` (paseo al azar; la interfaz lo avisa en todas las pantallas).

La API no tiene autenticación: es una herramienta local. No la expongas fuera de `127.0.0.1`.

## Desarrollar

```bash
python -m nexus_api            # API en :8800
cd nexus_web && npm run dev    # Vite en :5173, /api va a :8800
```

| Comando | Qué hace |
|---|---|
| `npm run typecheck` | TypeScript estricto |
| `npm test` | Vitest: formato, búsqueda, rutas, curva de capital, reglas del replay, espacio de trabajo |
| `npm run e2e` | Compila y corre Playwright contra la API en modo sintético (puerto 8811) |
| `python -m nexus_api.tipos_ts` | Regenera `src/api/contrato.gen.ts` desde el OpenAPI (una prueba de pytest exige que esté al día) |

## Cómo está armada

- `src/api/` cliente tipado; los tipos se **generan** del contrato `nexus.v1` de la API.
- `src/app/` shell, navegación, espacio de trabajo (guardado en el navegador, sin secretos), comandos y atajos.
- `src/components/` piezas reutilizables; `GraficoVelas` dibuja el límite del replay, la zona sin revelar y las sesiones.
- `src/modules/` los ocho módulos. Ningún cálculo financiero vive acá: tamaños, costos, órdenes, métricas y capas los
  calcula la API con el código del laboratorio. La interfaz solo formatea y arma la curva para graficar (misma definición que `lab/ficha.py`, con prueba).
- `src/styles/tokens.css` todos los colores, tipos, espacios y tiempos. Los componentes no tienen colores sueltos.

## Decisiones de diseño

- Dirección visual de la referencia de Fabrizio (27/11/2026): terminal oscuro con oro/ámbar como acento, riel de íconos
  con etiquetas, gráfico con RSI y MACD debajo, mapa de niveles y ticket a la derecha, cuenta simulada abajo.
- Lo propio de NEXUS es el **límite**: una línea punteada donde termina lo revelado y, a la derecha, una zona rayada vacía.
  Comunica la regla central del producto: no hay datos futuros.
- Velas doradas (alza) y rojo anaranjado (baja), validadas para daltonismo (deután ΔE 19,6), con signo escrito y ▲/▼.
- Donde la referencia muestra datos que no existen (libro de órdenes, volumen, una cuenta real) NEXUS muestra lo que sí
  hay: el mapa de precios conocidos y una cuenta simulada calculada por la API.
- Las cifras de una candidata no se pintan de verde: el nivel de evidencia y los avisos van al lado del número.
- IBM Plex Sans: legible en tamaños chicos y con cifras de ancho fijo (las columnas de precios se alinean).

## Versión publicada sin servidor

Para publicar NEXUS en un hosting estático gratuito (por ejemplo un Space estático de Hugging Face), la interfaz
puede leer respuestas grabadas en lugar de llamar a la API:

1. Con la API corriendo (`python -m nexus_api`), grabar: `npm run grabar -- http://127.0.0.1:8800 dist-estatico 200`.
   Recorre todos los módulos y 200 velas del replay de XAUUSD 15m, y guarda cada respuesta en
   `dist-estatico/instantanea/<clave>.json` (clave de `src/api/clave.ts`).
2. Construir: `npm run build:estatico` (`VITE_ESTATICO=1`, salida en `dist-estatico/`). Vite no borra
   `instantanea/` si se graba después del build; si se construye después, volver a grabar o copiarla.
3. Subir `dist-estatico/` tal cual.

Lo que no está grabado (órdenes simuladas, otras fechas o temporalidades del replay, corridas nuevas) muestra
«Disponible en la versión completa». Al final del tramo grabado el replay se detiene con un aviso.
