# Prueba de concepto: código Pine original dentro de NEXUS (28/11/2026)

**Resultado:** PineTS 0.13.1 (`npm i pinets@0.13.1`, runtime de Pine Script de LuxAlgo, AGPL-3.0) ejecutó el código
**original** de Smart Money Concepts [LuxAlgo] (`pine/terceros/luxalgo_smart_money_concepts.pine`) sobre 2.000 velas de
15 minutos de XAUUSD sin cambios ni errores, y devolvió los objetos que dibuja el indicador:
138 `label`, 138 `line`, 5 `box` (order blocks), con tiempo y precio exactos.
El primer order block (3.758,42 – 3.746,24) coincide con el port Python (`nexus_api/biblioteca/luxalgo_smc.py`).

**Conclusión para el plan:** la Fase A se hace con PineTS. Cada indicador de LuxAlgo/TradingView se guarda con su
código Pine original y NEXUS lo ejecuta tal cual; ya no hace falta portar a mano.

## Uso de la prueba

```bash
npm i pinets@0.13.1
node correr_pine.mjs <archivo.pine> <velas.json>
# velas.json: [{open, high, low, close, volume, openTime, closeTime}, ...] (ms UTC)
```
Salida: `plots` (series) y `fullContext._drawingHelpers` → `_labels`, `_lines`, `_boxes`, `_linefills`,
`_polylines`, `_tables` (filtrar `_deleted`).

## Próximos pasos (Fase A)

1. Correr PineTS en el navegador dentro de un Web Worker (o en Node en el servidor) con las velas del replay/vivo.
2. Traducir plots y dibujos al formato de `nexus_web/src/components/primitivaIndicadores.ts` (ya dibuja cajas,
   segmentos y etiquetas) y a los paneles de `PanelIndicador.tsx`; agregar linefill, polyline y tablas.
3. Ajustes (`input.*`) → ventana de ajustes generada desde los inputs del script (PineTS expone `inputs`).
4. Prueba de paridad por indicador contra valores de referencia del original.
5. Catálogo: `pine/terceros/<proveedor>/<slug>.pine` + metadatos (autor, licencia, versión) → biblioteca de NEXUS.
