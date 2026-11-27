"""
E029 — Benchmarks y alfa incremental de las candidatas (BITACORA, entrada 27).

Cada candidata se convierte en un retorno diario con 1 % de riesgo por operación, marcado a mercado con los cierres
diarios (17:00 NY) de su activo; las intradía (ICT 5 y SMC) se cuentan el día de salida. Benchmarks (mismos costos):
comprar y mantener el oro, oro con volatilidad objetivo 10 %, tendencia simple en oro (SMA 200) y risk parity solo
compras (7 índices + oro). Métrica principal: IR de tasación (α/σ_ε·√252, t de Newey-West con 10 rezagos).
Pasa: IR ≥ 0,3 con p < 0,05. Períodos: 15/11/2011–13/11/2026 (los líderes, hasta el 31/12/2021).
"""
import os
import sys

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import candidatas as C  # noqa: E402
from lab import benchmarks as BM, datos, diario, registro  # noqa: E402

SAL = "resultados/E029"
F = 0.01
INDICES = ["SPXUSD", "NSXUSD", "JPXJPY", "UKXGBP", "FRXEUR", "AUXAUD", "HKXHKD"]


def costo_rot(instr, precio):
    tipo, v = datos.COSTOS[instr]
    return (v if tipo == "pct" else v / precio) / 2


def serie_mtm(ops, fuente="m1"):
    """Retorno diario (fracción) con riesgo F por operación, sumando todos los activos de la candidata."""
    partes = []
    for instr, o in ops.groupby("instr"):
        d1 = BM.cierres_diarios(instr) if fuente == "m1" else _diario_hd(instr)
        partes.append(BM.diario_mtm(o, d1) * F)
    s = pd.concat(partes, axis=1).fillna(0.0).sum(axis=1)
    return s.groupby(level=0).sum()


def _diario_hd(instr):
    s = diario.desde_histdata(instr)
    return pd.DataFrame(dict(t=s["t"], c=s["c"]), index=s["fecha"])


def serie_salida(ops):
    d = pd.to_datetime(ops.t_salida, unit="ms", utc=True).dt.tz_convert("America/New_York")
    fecha = (d + pd.Timedelta(hours=7)).dt.tz_localize(None).dt.normalize()
    return (ops.r * F).groupby(fecha.values).sum()


if __name__ == "__main__":
    os.makedirs(SAL, exist_ok=True)
    oro = BM.cierres_diarios("XAUUSD")
    r_oro = BM.retornos(oro)
    c_oro = costo_rot("XAUUSD", float(oro.c.iloc[-1]))
    bench = {"oro comprar y mantener": r_oro,
             "oro volatilidad objetivo 10 %": BM.vol_objetivo(r_oro, costo_rotacion=c_oro)[0],
             "oro tendencia simple SMA 200": BM.tendencia_simple(r_oro, oro.c, costo_rotacion=c_oro)[0]}
    Cs = pd.DataFrame({i: BM.cierres_diarios(i).c for i in INDICES + ["XAUUSD"]}).sort_index()
    rp, _ = BM.risk_parity(Cs.pct_change(), costos={i: costo_rot(i, float(Cs[i].dropna().iloc[-1])) for i in Cs.columns})
    bench["risk parity (7 índices + oro)"] = rp
    cand = {
        "E022 oro D1": (serie_mtm(C.e022()), ["oro comprar y mantener", "oro volatilidad objetivo 10 %", "oro tendencia simple SMA 200",
                                              "risk parity (7 índices + oro)"]),
        "candidata B (tendencia, 8 activos)": (serie_mtm(C.candidata_b()), ["risk parity (7 índices + oro)"]),
        "líderes top 3 + mínimo 10 d (hasta 2021)": (serie_mtm(C.lideres(), fuente="hd"), ["risk parity (7 índices + oro)"]),
        "ICT 5 oro (2010–2026)": (serie_salida(pd.concat([C.ict5_oro("2010-11-15", "2021-11-15", carga="2010-01-01"), C.ict5_oro()])),
                                  ["oro comprar y mantener", "risk parity (7 índices + oro)"]),
        "SMC oro (2010–2026)": (serie_salida(pd.concat([C.smc_oro("2010-11-15", "2021-11-15", carga="2010-01-01"), C.smc_oro()])),
                                ["oro comprar y mantener", "risk parity (7 índices + oro)"]),
        "E036 tendencia multiactivo": (pd.read_csv("resultados/E036/retornos_diarios.csv", index_col=0, parse_dates=True).r,
                                       ["risk parity (7 índices + oro)"]),
    }
    filas = []
    for nombre, (s, bs) in cand.items():
        a = pd.Timestamp("2011-11-15")
        b = pd.Timestamp("2022-01-01") if "hasta 2021" in nombre else pd.Timestamp("2026-11-14")
        for bn in bs:
            rb = bench[bn]
            idx = rb.index[(rb.index >= a) & (rb.index < b)]
            rs = s.reindex(idx).fillna(0.0)
            t = BM.tasacion(rs, rb.reindex(idx).fillna(0.0))
            m = BM.metricas_serie(rs)
            filas.append(dict(estrategia=nombre, benchmark=bn, desde=idx[0].date(), hasta=idx[-1].date(), **t,
                              cagr_1pct=m["cagr"], max_dd_1pct=m["max_dd"],
                              pasa=bool(t["ir_tasacion"] >= 0.3 and t["p_alfa"] < 0.05)))
            print(nombre, "vs", bn, {k: round(v, 3) if isinstance(v, float) else v for k, v in t.items()}, flush=True)
    for bn, rb in bench.items():
        m = BM.metricas_serie(rb[(rb.index >= "2011-11-15") & (rb.index < "2026-11-14")])
        filas.append(dict(estrategia=f"[benchmark] {bn}", benchmark="-", sharpe_estrategia=m["sharpe"], cagr_1pct=m["cagr"],
                          max_dd_1pct=m["max_dd"]))
    t = pd.DataFrame(filas)
    t.to_csv(f"{SAL}/tasacion.csv", index=False)
    print(t[["estrategia", "benchmark", "ir_tasacion", "p_alfa", "beta", "ir_activo", "sharpe_estrategia", "sharpe_benchmark",
             "correlacion", "pasa"]].round(3).to_string(index=False))
    registro.registrar("E029", __file__, hipotesis="Las candidatas agregan alfa sobre benchmarks pasivos con los mismos costos",
                       n_variantes=len(cand), resultados=t)
