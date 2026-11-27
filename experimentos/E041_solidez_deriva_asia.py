"""
E041 — Pruebas de solidez de la deriva de Asia (E040: comprar 18:00 NY, vender 22:00 NY), registradas en la entrada 33.
Uso: python experimentos/E041_solidez_deriva_asia.py
"""
import os
import sys

import numpy as np
import pandas as pd
from scipy import stats

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from lab import benchmarks as BM, datos, ejecucion as EJ, eventos as EV, registro  # noqa: E402

SAL = "resultados/E041"
INI, FIN_DEV, FIN = (pd.Timestamp(x, tz="UTC").value // 10**6 for x in ("2010-11-15", "2021-11-15", "2026-11-14"))


def bloque(m1, dia, tm, a, b, desde=INI, hasta=FIN):
    df = pd.DataFrame(dict(dia=dia, tm=tm, i=np.arange(len(dia))))
    df = df[(m1["t"] >= desde) & (m1["t"] < hasta) & (df.tm >= a) & (df.tm < b)]
    g = df.groupby("dia").i.agg(["min", "max", "size"])
    g = g[g["size"] >= 0.5 * (b - a)]
    ie, js = g["min"].values, g["max"].values
    return pd.DataFrame(dict(dia=g.index.values, t=m1["t"][ie], t_salida=m1["t"][js] + 60000, dir=1, entrada=m1["o"][ie],
                             salida=m1["c"][js], sl=m1["o"][ie] * 0.99, motivo=2, ie=ie, js=js))


def neto(ops, vol, perfil):
    c = EJ.costos(ops, "XAUUSD", vol, perfil) if perfil != "costos.md" else np.asarray(datos.costo("XAUUSD", ops.entrada.values), float)
    return (ops.salida.values - ops.entrada.values) / ops.entrada.values - c / ops.entrada.values


def resumen(v):
    v = np.asarray(v)
    t = v.mean() / (v.std(ddof=1) / np.sqrt(len(v)))
    return dict(n=len(v), medio_pct=100 * v.mean(), wr=float((v > 0).mean()), p=float(stats.t.sf(t, len(v) - 1)))


if __name__ == "__main__":
    os.makedirs(SAL, exist_ok=True)
    m1 = datos.cargar("XAUUSD")
    d1 = datos.velas(m1, 1440)
    dia = np.searchsorted(d1["t"], m1["t"], side="right") - 1
    tm = ((EV.minuto_ny(m1["t"]) - 1020) % 1440).astype(np.int64)
    vol = EJ.Volatilidad(m1)
    ops = bloque(m1, dia, tm, 60, 300)
    dev = ops.t < FIN_DEV
    filas = []
    # 1) costos realistas
    for perfil in ("costos.md", "optimista", "base", "conservador", "estres"):
        v = neto(ops, vol, perfil)
        for nombre, m in (("desarrollo", dev), ("confirmacion", ~dev)):
            filas.append(dict(prueba="1 costos", variante=perfil, muestra=nombre, **resumen(v[m])))
    v_base = neto(ops, vol, "base")
    # 2) años
    anio = pd.to_datetime(ops.t, unit="ms", utc=True).dt.year.values
    por_anio = pd.DataFrame(dict(anio=anio, r=v_base)).groupby("anio").r.agg(n="size", suma_pct=lambda x: 100 * x.sum(), media_pct=lambda x: 100 * x.mean())
    por_anio.to_csv(f"{SAL}/por_anio_base.csv")
    bajista = por_anio.loc[[2013, 2014, 2015], "suma_pct"]
    # 3) contra comprar y mantener el oro (retornos diarios por día de operación)
    d1df = BM.cierres_diarios("XAUUSD", m1=m1)
    rb = BM.retornos(d1df)
    fecha_op = (pd.to_datetime(ops.t, unit="ms", utc=True).dt.tz_convert("America/New_York") + pd.Timedelta(hours=7)).dt.tz_localize(None).dt.normalize()
    rs = pd.Series(v_base, index=fecha_op.values).groupby(level=0).sum().reindex(rb.index).fillna(0.0)
    rs = rs[(rs.index >= "2010-11-15") & (rs.index < "2026-11-14")]
    tas = BM.tasacion(rs, rb.reindex(rs.index).fillna(0.0))
    tas_conf = BM.tasacion(rs[rs.index >= "2021-11-15"], rb.reindex(rs.index).fillna(0.0)[rs.index >= "2021-11-15"])
    # 4) meseta de horarios
    for nombre, a, b in (("entrada 18:05", 65, 300), ("entrada 18:15", 75, 300), ("entrada 18:30", 90, 300), ("salida 21:00", 60, 240), ("salida 23:00", 60, 360)):
        o2 = bloque(m1, dia, tm, a, b)
        v2 = neto(o2, vol, "base")
        d2 = o2.t < FIN_DEV
        for mn, m in (("desarrollo", d2), ("confirmacion", ~d2)):
            filas.append(dict(prueba="4 meseta", variante=nombre, muestra=mn, **resumen(v2[m])))
    # 5) día de la semana (de la entrada, hora de NY)
    dow = pd.to_datetime(ops.t, unit="ms", utc=True).dt.tz_convert("America/New_York").dt.day_name().values
    for d in ("Sunday", "Monday", "Tuesday", "Wednesday", "Thursday"):
        m = dow == d
        if m.sum() > 30:
            filas.append(dict(prueba="5 día", variante=d, muestra="todo", **resumen(v_base[m])))
    # 6) stop de protección 0,5·ATR(14) diario
    atr = datos.atr(d1, 14)
    atr_prev = np.concatenate([[np.nan], atr[:-1]])[ops.dia.values]
    ok = np.isfinite(atr_prev)
    o3 = ops[ok]
    sl = o3.entrada.values - 0.5 * atr_prev[ok]
    tp = o3.entrada.values + 100 * atr_prev[ok]
    r, mot, js = EV.simular_hasta_salida(m1["o"], m1["h"], m1["l"], m1["c"], o3.ie.values.astype(np.int64), np.ones(len(o3), np.int64), sl, tp,
                                         np.zeros(len(o3)), o3.js.values.astype(np.int64))
    px = o3.entrada.values + r * (o3.entrada.values - sl)
    o3b = o3.assign(salida=px, t_salida=m1["t"][np.clip(js, 0, None)] + 60000, motivo=np.where(mot == -1, -1, 2))
    v3 = neto(o3b, vol, "base")
    d3 = o3b.t < FIN_DEV
    for mn, m in (("desarrollo", d3), ("confirmacion", ~d3)):
        filas.append(dict(prueba="6 stop 0,5 ATR", variante=f"stops tocados {int((mot[m.values] == -1).sum())}", muestra=mn, **resumen(v3[m])))
    t = pd.DataFrame(filas)
    t.to_csv(f"{SAL}/solidez.csv", index=False)
    pd.Series(tas).to_csv(f"{SAL}/tasacion_total.csv")
    pd.Series(tas_conf).to_csv(f"{SAL}/tasacion_confirmacion.csv")
    ops.assign(neto_base_pct=100 * v_base).drop(columns=["ie", "js"]).to_csv(f"{SAL}/operaciones.csv.gz", index=False)
    cons = t[(t.prueba == "1 costos") & (t.variante == "conservador")]
    mes = t[t.prueba == "4 meseta"]
    criterios = {
        "1 conservador positivo en las dos muestras": bool((cons.medio_pct > 0).all()),
        "2 al menos 2 de 2013–2015 positivos": bool((bajista > 0).sum() >= 2),
        "3 IR de tasación ≥ 0,3 con p < 0,05": bool(tas["ir_tasacion"] >= 0.3 and tas["p_alfa"] < 0.05),
        "4 meseta: todos los vecinos positivos": bool((mes.medio_pct > 0).all()),
    }
    print(t.round(4).to_string(index=False))
    print("\naños (base, % sumado):\n", por_anio.round(3).T.to_string())
    print("\ntasación total:", {k: round(v, 3) for k, v in tas.items()})
    print("tasación últimos 5 años:", {k: round(v, 3) for k, v in tas_conf.items()})
    print("\nCRITERIOS:", criterios, "→", "PASA" if all(criterios.values()) else "NO PASA")
    registro.registrar("E041", __file__, hipotesis="Solidez de la deriva de Asia 18–22 NY", universo="XAUUSD M1", resultados=t,
                       criterios=criterios, tasacion=tas)
