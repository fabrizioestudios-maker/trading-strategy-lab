# Datos

No se suben al repositorio (pesan cientos de MB). Para regenerarlos:

```bash
python -m lab.descarga_histdata EURUSD GBPUSD USDJPY AUDUSD SPXUSD NSXUSD GRXEUR --desde 2016 --hasta 2026 --mes-actual 11
```

- Fuente: HistData.com, velas de 1 minuto en ASCII, precios bid, hora EST fija (UTC−5); se convierten a UTC.
- El oro (XAUUSD 2018–2026) sale del reproductor de barras del proyecto. Son datos de HistData hasta el 13/11/2026 y de Dukascopy después. Se convierten con `lab.datos.xau_desde_reproductor(<carpeta datos del reproductor>)`.
- Formato: `data/<INSTRUMENTO>.npz` con `t` (ms UTC, apertura del minuto), `o`, `h`, `l`, `c`.
- HistData no trae volumen para estos instrumentos: las ideas de volumen o order flow no se pueden probar con estos datos.
