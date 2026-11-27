"""
Paridad con el Strategy Tester de TradingView: compara la "Lista de operaciones" exportada de TradingView (CSV) con las
operaciones del laboratorio, operación por operación.

Uso:
  python herramientas/comparar_tradingview.py <export_tradingview.csv> [resultados/E022/operaciones_5a.csv]

Cómo exportar en TradingView: Probador de estrategias → Lista de operaciones → Exportar (si el plan lo permite).
Hay que usar el mismo símbolo y feed que cierra la vela diaria a las 17:00 de Nueva York (p. ej. OANDA:XAUUSD), el mismo
rango de fechas y `pine/oro_d1_bollinger_sma200.pine` sin cambios.

Tolerancias (fijadas de antemano):
  - misma operación: misma dirección y entrada el mismo día (± 1 día por diferencias de sesión del feed);
  - precio de entrada y de salida: ± 0,1 % (otro feed, otro precio); resultado: mismo signo (TP / SL).
Clasifica cada operación como idéntica, distinta en precio, distinta en resultado, faltante (solo en el laboratorio) o
adicional (solo en TradingView).
"""
import sys

import pandas as pd


def leer_tradingview(ruta):
    tv = pd.read_csv(ruta)
    tv.columns = [c.strip().lower() for c in tv.columns]
    col = {c: c for c in tv.columns}
    num = next(c for c in col if c.startswith("trade") or c.startswith("operación") or c == "#")
    tipo = next(c for c in col if c.startswith("type") or c.startswith("tipo"))
    fecha = next(c for c in col if "date" in c or "fecha" in c)
    precio = next(c for c in col if c.startswith("price") or c.startswith("precio"))
    filas = []
    for n, g in tv.groupby(num):
        ent = g[g[tipo].str.lower().str.contains("entry|entrada")]
        sal = g[g[tipo].str.lower().str.contains("exit|salida")]
        if ent.empty or sal.empty:
            continue
        e, s = ent.iloc[0], sal.iloc[0]
        d = 1 if ("long" in e[tipo].lower() or "compra" in e[tipo].lower()) else -1
        filas.append(dict(dir=d, entrada_t=pd.to_datetime(e[fecha]), entrada=float(e[precio]), salida=float(s[precio])))
    return pd.DataFrame(filas)


def comparar(tv, lab, tol_precio=0.001):
    lab = lab.copy()
    lab["dir"] = lab.direccion.map({"compra": 1, "venta": -1})
    lab["entrada_t"] = pd.to_datetime(lab.entrada_utc)
    usados, filas = set(), []
    for _, o in lab.iterrows():
        cand = tv[(tv.dir == o.dir) & ((tv.entrada_t - o.entrada_t).abs() <= pd.Timedelta(days=1))]
        cand = cand[~cand.index.isin(usados)]
        if cand.empty:
            filas.append(dict(entrada_lab=o.entrada_utc, estado="faltante en TradingView"))
            continue
        t = cand.iloc[0]
        usados.add(cand.index[0])
        de = abs(t.entrada / o.precio_entrada - 1)
        ds = abs(t.salida / o.precio_salida - 1)
        gana_lab = o.r > 0
        gana_tv = (t.salida - t.entrada) * t.dir > 0
        estado = "idéntica" if de <= tol_precio and ds <= tol_precio else ("distinta en resultado" if gana_lab != gana_tv else "distinta en precio")
        filas.append(dict(entrada_lab=o.entrada_utc, entrada_tv=t.entrada_t, dif_entrada_pct=100 * de, dif_salida_pct=100 * ds, estado=estado))
    for i, t in tv.iterrows():
        if i not in usados:
            filas.append(dict(entrada_tv=t.entrada_t, estado="adicional en TradingView"))
    return pd.DataFrame(filas)


if __name__ == "__main__":
    tv = leer_tradingview(sys.argv[1])
    lab = pd.read_csv(sys.argv[2] if len(sys.argv) > 2 else "resultados/E022/operaciones_5a.csv")
    r = comparar(tv, lab)
    print(r.estado.value_counts().to_string())
    r.to_csv("resultados/paridad_tradingview.csv", index=False)
    print("detalle: resultados/paridad_tradingview.csv")
