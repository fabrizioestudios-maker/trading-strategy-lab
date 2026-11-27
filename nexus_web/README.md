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

- Paleta del brief: Obsidian, Graphite, Gold (identidad: marca, módulo activo, nivel de evidencia), Neural Cyan (estado
  activo, foco, límite del replay), White. Sin brillos, neón, vidrio ni degradados decorativos.
- Lo propio de NEXUS es el **límite**: una línea cian donde termina lo revelado y, a la derecha, una zona rayada vacía.
  Se repite en el chip de la barra superior. Comunica la regla central del producto: no hay datos futuros.
- Alza y baja validadas para daltonismo (protán/deután ΔE ≥ 10) y con una segunda señal: vela hueca o llena, signo escrito, ▲/▼.
- Las cifras de una candidata no se pintan de verde: el nivel de evidencia y los avisos van al lado del número.
- IBM Plex Sans: legible en tamaños chicos y con cifras de ancho fijo (las columnas de precios se alinean).
