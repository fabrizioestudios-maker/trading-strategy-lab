"""
F001 — Prueba a futuro de E022 (oro D1) y del setup 5 ICT en oro (BITACORA, entrada 27).

  python experimentos/F001_prueba_a_futuro.py sellar      # una sola vez: escribe registro/forward/F001.json (hash + intervalos)
  python experimentos/F001_prueba_a_futuro.py actualizar  # con data/XAUUSD.npz al día: agrega las operaciones nuevas y el estado

Las operaciones cuentan desde el primer cierre diario posterior al sellado (27/11/2026 17:00 NY). Las reglas y el
código quedan fijos: si el hash de los archivos cambia, `actualizar` avisa y no evalúa. Decisión al llegar a 30
operaciones de cada estrategia: pasa si la expectancy es > 0 y cae dentro del intervalo de predicción del 95 % de la
media de 30 operaciones calculado con el backtest (media ± 1,96·sd/√30). Informe trimestral.
"""
import hashlib
import json
import os
import sys

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RAIZ)
import candidatas as C  # noqa: E402

DIR = os.path.join(RAIZ, "registro", "forward")
SELLO = os.path.join(DIR, "F001.json")
INICIO = "2026-11-27 22:00"  # 17:00 NY (UTC−5): primer cierre diario posterior al sellado
ARCHIVOS = ["lab/grilla.py", "lab/motor.py", "lab/datos.py", "lab/senales.py", "lab/ict.py", "lab/smc.py",
            "experimentos/E025_ict_cinco_setups.py", "experimentos/E023_smc_grilla.py", "experimentos/candidatas.py",
            "experimentos/F001_prueba_a_futuro.py"]


def huellas():
    return {a: hashlib.sha256(open(os.path.join(RAIZ, a), "rb").read()).hexdigest() for a in ARCHIVOS}


def intervalo(r, n=30):
    r = np.asarray(r)
    m, s = r.mean(), r.std(ddof=1)
    return dict(media_backtest=float(m), sd_backtest=float(s), n_backtest=len(r),
                ip95_media_30=[float(m - 1.96 * s / np.sqrt(n)), float(m + 1.96 * s / np.sqrt(n))])


def sellar():
    if os.path.exists(SELLO):
        raise SystemExit("F001 ya está sellado: no se vuelve a sellar.")
    os.makedirs(DIR, exist_ok=True)
    e22 = C.e022("2011-11-15")
    ict = pd.concat([C.ict5_oro("2010-11-15", "2021-11-15", carga="2010-01-01"), C.ict5_oro()])
    sello = dict(
        id="F001", sellado_utc=pd.Timestamp.now(tz="UTC").strftime("%Y-%m-%d %H:%M"), inicio_utc=INICIO,
        estrategias={
            "E022": dict(reglas="XAUUSD D1 (cierre 17:00 NY); cierre fuera de Bollinger (20, 2, desvío poblacional) por primera vez, a favor de la SMA 200 (cierre sobre/bajo); ambas direcciones; entrada en el minuto siguiente al cierre; SL 0,5·ATR(14) de Wilder; TP 2·SL; una a la vez; costos de docs/costos.md",
                         config=list(C.CFG_E022), backtest=intervalo(e22.r.values)),
            "ICT5": dict(reglas="XAUUSD 15M con sesgo de estructura de 4H; killzone de NY; barrido del último swing interno (pivote de 3) y FVG ≥ 0,25 ATR en 10 velas; orden límite al 50 % del FVG; SL detrás del barrido + 0,1 ATR; TP 2R; máximo 2 por día y corte tras 2 pérdidas; sin cierre forzado",
                         config=dict(setup=5, sesgo="estructura", N=10, V=10, minfvg=0.25, ce=1, kz="NY", cierre=False),
                         backtest=intervalo(ict.r.values)),
        },
        decision="al llegar a 30 operaciones: pasa si expectancy > 0 y dentro del IP95 de la media de 30",
        datos="XAUUSD M1: HistData mensual (ASCII) + Dukascopy cuando responda; se agregan con lab/descarga_histdata.py",
        huellas=huellas())
    json.dump(sello, open(SELLO, "w"), ensure_ascii=False, indent=1)
    print(json.dumps({k: v for k, v in sello.items() if k != "huellas"}, ensure_ascii=False, indent=1))


def actualizar():
    sello = json.load(open(SELLO))
    cambios = [a for a, h in huellas().items() if sello["huellas"].get(a) != h and a != "experimentos/F001_prueba_a_futuro.py"]
    if cambios:
        raise SystemExit(f"El código cambió desde el sellado ({cambios}): F001 no se evalúa con otro código.")
    desde = pd.Timestamp(INICIO, tz="UTC").strftime("%Y-%m-%d %H:%M")
    filas = []
    for nombre, ops in (("E022", C.e022(desde)), ("ICT5", C.ict5_oro(desde, carga="2026-01-01"))):
        ops = ops.assign(estrategia=nombre)
        filas.append(ops)
        r = ops.r.values
        ip = sello["estrategias"][nombre]["backtest"]["ip95_media_30"]
        estado = "en curso" if len(r) < 30 else ("pasa" if r.mean() > 0 and ip[0] <= r.mean() <= ip[1] else "no pasa")
        print(f"{nombre}: {len(r)} operaciones a futuro, expectancy {r.mean() if len(r) else float('nan'):+.3f} R → {estado}")
    pd.concat(filas).to_csv(os.path.join(DIR, "F001_operaciones.csv"), index=False)


if __name__ == "__main__":
    {"sellar": sellar, "actualizar": actualizar}[sys.argv[1]]()
