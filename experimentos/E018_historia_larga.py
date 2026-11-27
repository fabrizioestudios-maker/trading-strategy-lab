"""
E018 — Fase 3: las candidatas, con parámetros fijos, en otras condiciones de mercado (BITACORA, entrada 17).

Uso:
  python experimentos/E018_historia_larga.py metodo    # velas diarias de HistData como serie base vs el motor M1 (< 2022)
  python experimentos/E018_historia_larga.py calidad   # control de calidad de data/externo/*.csv por año
  python experimentos/E018_historia_larga.py solape    # 2010–2021: la misma prueba con los CSV externos y con HistData
  python experimentos/E018_historia_larga.py prueba    # 1990–2009 (y 1990–1999, 2000–2009): configuraciones registradas

Nunca muestra operaciones con entrada desde 2022: la validación 2022–2026 sigue sin tocar.
"""
import os
import sys

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from lab import diario, estrategia, senales as S  # noqa: E402
from lab.metricas import resumen  # noqa: E402

UNIV8 = ["SPXUSD", "NSXUSD", "JPXJPY", "UKXGBP", "FRXEUR", "AUXAUD", "XAUUSD", "XAGUSD"]
UNIV9 = UNIV8[:6] + ["HKXHKD"] + UNIV8[6:]
# Entrada 27: el oro y la plata de Yahoo no sirven antes de 2012 (calidad, entrada 18). Con --sin-metales los dos
# universos quedan en los índices (6 y 7), con los controles "comprar siempre" en el mismo universo.
SIN_METALES = "--sin-metales" in sys.argv
if SIN_METALES:
    UNIV8 = [i for i in UNIV8 if i not in ("XAUUSD", "XAGUSD")]
    UNIV9 = [i for i in UNIV9 if i not in ("XAUUSD", "XAGUSD")]
RR = 2.1
VAL = pd.Timestamp("2022-01-01").value // 10**6

# Configuraciones registradas (entrada 17): (id, señal, universo, top, k)
CONFIGS = [
    (1, "tendencia 200", "8", None, 6.0),
    (2, "comprar siempre", "8", None, 6.0),
    (3, "líder + mínimo 10d", "9", 3, 5.0),
    (4, "líder + RSI2<25", "9", 4, 6.0),
    (5, "líder + RSI2<25", "9", 3, 6.0),
    (6, "líder (cualquier vela)", "9", 3, 6.0),
    (7, "comprar siempre", "9", None, 5.0),
    (8, "comprar siempre", "9", None, 6.0),
]
CONTROL = {1: 2, 3: 7, 4: 8, 5: 8, 6: 8}  # configuración -> su control "comprar siempre" (mismo universo y k)


def ms(fecha):
    return pd.Timestamp(fecha).value // 10**6


def cargar(fuente, univ):
    series = {}
    for i in univ:
        if fuente == "histdata":
            series[i] = diario.desde_histdata(i)
        else:
            ruta = diario.archivo(i)
            if ruta is None:
                print(f"  falta el archivo de {i} en data/externo/", flush=True)
                continue
            series[i] = diario.desde_csv(ruta)
    return series


def momentum_mensual(series):
    tab = {}
    for i, s in series.items():
        per = s["fecha"].to_period("M")
        c = pd.Series(s["c"], index=per)
        tab[i] = c.groupby(level=0).last() / c.shift(252).groupby(level=0).last() - 1
    return pd.DataFrame(tab).sort_index()


def senal(nombre, i, s, mom, top):
    c = s["c"]
    if nombre == "comprar siempre":
        return np.ones(len(c), int)
    if nombre == "tendencia 200":
        return S.tendencia(s, 200)
    lid_m = ((mom.rank(axis=1, ascending=False) <= top) & (mom > 0)).shift(1)
    lid_m = lid_m.astype("boolean").fillna(False).astype(bool)
    lid = lid_m[i].reindex(s["fecha"].to_period("M")).fillna(False).values.astype(bool)
    if nombre == "líder (cualquier vela)":
        return np.where(lid, 1, 0)
    if nombre == "líder + mínimo 10d":
        return np.where(lid & (c <= pd.Series(c).rolling(10).min().values), 1, 0)
    if nombre == "líder + RSI2<25":
        return np.where(lid & (S.rsi(c, 2) < 25), 1, 0)
    raise ValueError(nombre)


def operar(series, mom, nombre, top, k):
    """Operaciones de todos los activos (dict de arrays concatenados, con el activo de cada una)."""
    partes = []
    for i, s in series.items():
        ops = estrategia.operaciones(i, s, s, senal(nombre, i, s, mom, top), k, rr=RR, lados=(1,))
        if ops is None:
            continue
        m = ops["motivo"] != 3
        partes.append(pd.DataFrame(dict(activo=i, t=ops["t"][m], t_salida=ops["t_salida"][m], r=ops["r"][m])))
    df = pd.concat(partes, ignore_index=True) if partes else pd.DataFrame(columns=["activo", "t", "t_salida", "r"])
    return df[df.t < VAL]  # nunca la validación


def tramo(df, desde, hasta):
    d = df[(df.t >= ms(desde)) & (df.t < ms(hasta))].sort_values("t")  # orden de entrada, para el drawdown
    return resumen(d.r.values, d.t.values, d.t_salida.values)


def fila(cid, nombre, univ, top, k, s):
    return dict(id=cid, senal=nombre, univ=univ, top=top or "-", k=k, n=s.get("n", 0), wr=s.get("wr", np.nan),
                wr_lo=s.get("wr_lo", np.nan), payoff=s.get("payoff", np.nan), pf=s.get("pf", np.nan),
                exp=s.get("expectancy", np.nan), max_dd=s.get("max_dd", np.nan),
                dias=s.get("horas_media", np.nan) / 24 if s.get("n", 0) else np.nan)


def mostrar(df, titulo):
    o = df.copy()
    for c in ("wr", "wr_lo"):
        o[c] = (o[c] * 100).round(1)
    print(f"\n== {titulo} ==")
    print(o.round(3).to_string(index=False), flush=True)


def correr(fuente, tramos, con_vecinos=False):
    s8, s9 = cargar(fuente, UNIV8), cargar(fuente, UNIV9)
    universo = {"8": s8, "9": s9}
    moms = {u: momentum_mensual(s) for u, s in universo.items()}
    print("activos:", {u: list(s) for u, s in universo.items()}, flush=True)
    resultados = {}
    for cid, nombre, u, top, k in CONFIGS:
        ks = [k - 1, k, k + 1] if con_vecinos else [k]
        for kk in ks:
            resultados[(cid, kk)] = operar(universo[u], moms[u], nombre, top, kk)
    tablas = {}
    for desde, hasta in tramos:
        filas = []
        for cid, nombre, u, top, k in CONFIGS:
            s = tramo(resultados[(cid, k)], desde, hasta)
            f = fila(cid, nombre, u, top, k, s)
            if con_vecinos:
                for kk, tag in ((k - 1, "vec_menos"), (k + 1, "vec_mas")):
                    f[tag] = round(tramo(resultados[(cid, kk)], desde, hasta).get("wr", np.nan) * 100, 1)
            filas.append(f)
        t = pd.DataFrame(filas).set_index("id")
        t["wr_vs_siempre"] = [(t.loc[i, "wr"] - t.loc[CONTROL[i], "wr"]) * 100 if i in CONTROL else np.nan for i in t.index]
        t["exp_vs_siempre"] = [t.loc[i, "exp"] - t.loc[CONTROL[i], "exp"] if i in CONTROL else np.nan for i in t.index]
        tablas[(desde, hasta)] = t.reset_index()
        mostrar(t.reset_index(), f"{fuente} {desde} a {hasta}")
    return tablas, resultados


def criterios(t):
    t = t.copy()
    t["pasa"] = (t.n >= 30) & (t.wr >= 0.5) & (t.payoff >= 2.0) & (t.exp > 0)
    t["ventaja"] = t.id.isin(CONTROL.keys()) & (t.wr_vs_siempre >= 3) & (t.exp_vs_siempre > 0)
    if "vec_menos" in t:
        t["vecinos_ok"] = (t.vec_menos >= 47) & (t.vec_mas >= 47)
    return t


if __name__ == "__main__":
    modo = next((a for a in sys.argv[1:] if not a.startswith("--")), "metodo")
    os.makedirs("resultados/E018", exist_ok=True)
    if modo == "metodo":
        tablas, _ = correr("histdata", [("2000-01-01", "2022-01-01")])
        list(tablas.values())[0].to_csv("resultados/E018/metodo_histdata_diario.csv", index=False)
        print("\nReferencia con el motor M1 (E009, E017, selección < 2022): 1) 51,0 % n=102 · 2) 49,5 % · "
              "3) 50,0 % n=100 · 4) 52,5 % n=101 · 5) 54,9 % n=82 · 6) 52,4 % n=82 · 7) 44,4 % n=187 · 8) 47,0 % n=117")
    elif modo == "calidad":
        filas = []
        for i in UNIV9:
            ruta = diario.archivo(i)
            if ruta is None:
                print(i, "sin archivo")
                continue
            s = diario.desde_csv(ruta)
            q = diario.calidad(s)
            q.to_csv(f"resultados/E018/calidad_{i}.csv")
            buenos = q[(q.pct_sin_rango < 5) & (q.pct_incoherente < 1)].index
            filas.append(dict(activo=i, archivo=os.path.basename(ruta), desde=str(s["fecha"][0].date()),
                              hasta=str(s["fecha"][-1].date()), velas=len(s["t"]),
                              primer_anio_ohlc_bueno=int(buenos.min()) if len(buenos) else None,
                              anios_malos_desde_1988=[int(a) for a in q.index if a >= 1988 and a not in buenos],
                              huecos_10d=int(q.huecos_10d.sum()), saltos_20pct=int(q.saltos_20pct.sum())))
        out = pd.DataFrame(filas)
        out.to_csv("resultados/E018/calidad.csv", index=False)
        print(out.to_string(index=False))
    elif modo in ("solape", "solape2012"):
        # solape2012 (entrada 28): HistData empieza el 14/11/2010 y su SMA 200 diaria recién vale desde fines de 2011;
        # la comparación justa es en el tramo con calentamiento completo en las dos fuentes, 2012–2021.
        tramo_s = ("2010-01-01", "2022-01-01") if modo == "solape" else ("2012-01-01", "2022-01-01")
        ext, _ = correr("externo", [tramo_s])
        hd, _ = correr("histdata", [tramo_s])
        a, b = list(ext.values())[0], list(hd.values())[0]
        cmp = a[["id", "senal", "univ", "k", "n", "wr", "exp"]].merge(b[["id", "n", "wr", "exp"]], on="id", suffixes=("_ext", "_histdata"))
        cmp["dif_wr_pp"] = ((cmp.wr_ext - cmp.wr_histdata) * 100).round(1)
        cmp["dif_exp"] = (cmp.exp_ext - cmp.exp_histdata).round(3)
        cmp.to_csv("resultados/E018/" + ("solape_2010_2021" if modo == "solape" else "solape_2012_2021")
                   + ("_sin_metales" if SIN_METALES else "") + ".csv", index=False)
        print("\n== solape 2010–2021: externo vs HistData ==")
        print(cmp.round(3).to_string(index=False))
    elif modo == "prueba":
        tr = [("1990-01-01", "2010-01-01"), ("1990-01-01", "2000-01-01"), ("2000-01-01", "2010-01-01")]
        tablas, resultados = correr("externo", tr, con_vecinos=True)
        for (d, h), t in tablas.items():
            t = criterios(t)
            t.to_csv(f"resultados/E018/prueba_{d[:4]}_{h[:4]}" + ("_sin_metales" if SIN_METALES else "") + ".csv", index=False)
            if d == "1990-01-01" and h == "2010-01-01":
                print("\n== criterios registrados (1990–2009) ==")
                print(t[["id", "senal", "k", "n", "wr", "payoff", "exp", "wr_vs_siempre", "pasa", "ventaja", "vecinos_ok"]].round(3).to_string(index=False))
        partes = []
        for (cid, k), df in resultados.items():
            if k == dict((c[0], c[4]) for c in CONFIGS)[cid]:
                d = df[(df.t >= ms("1990-01-01")) & (df.t < ms("2010-01-01"))]
                g = d.groupby("activo").r.agg(n="size", wr=lambda r: (r > 0).mean(), r_total="sum")
                g["id"] = cid
                partes.append(g.reset_index())
        pd.concat(partes).to_csv("resultados/E018/prueba_por_activo" + ("_sin_metales" if SIN_METALES else "") + ".csv", index=False)
    else:
        raise SystemExit(__doc__)
