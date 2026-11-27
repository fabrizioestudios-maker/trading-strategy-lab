"""
E034 — Régimen con HMM causal para E022 y el setup 5 ICT (BITACORA, entrada 27).

Variables diarias del oro: log de la volatilidad realizada (raíz de la suma de retornos log de 5 minutos al cuadrado en
la vela diaria) y log del GVZ (FRED, conocido a las 16:15 NY). HMM gaussiano de 2 y 3 estados ajustado SOLO con el
desarrollo (velas del 15/11/2010 al 14/11/2021) y congelado; estado de cada día = argmax de la probabilidad FILTRADA.
E022 usa el estado del día de la señal; ICT 5, el del cierre diario anterior a la entrada.
Regla registrada: se permiten los estados con expectancy > 0 en desarrollo solo si la diferencia (permitidos − resto)
da p < 0,05 por permutación (10.000); si no, no hay filtro. En la confirmación: expectancy filtrada ≥ 0,9 × la sin
filtro; se informa la varianza del acierto entre regímenes.
"""
import os
import sys

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import candidatas as C  # noqa: E402
from lab import datos, externos as X, regimen, registro  # noqa: E402

SAL = "resultados/E034"
FIN_DEV = C.ms("2021-11-15")


def variables():
    m1 = datos.cargar("XAUUSD")
    d1 = datos.velas(m1, 1440)
    m5 = datos.velas(m1, 5)
    lr = np.diff(np.log(m5["c"]), prepend=np.log(m5["c"][0]))
    dia = np.searchsorted(d1["t"], m5["t"], side="right") - 1
    rv = np.sqrt(np.bincount(dia, weights=lr ** 2, minlength=len(d1["t"])))
    gvz = X.a_velas(X.fred("GVZCLS"), d1)
    df = pd.DataFrame(dict(t=d1["t"], lrv=np.log(np.where(rv > 0, rv, np.nan)), lgvz=np.log(gvz)))
    return df


def permutacion(r, permitido, B=10000, semilla=0):
    rng = np.random.default_rng(semilla)
    r = np.asarray(r, float)
    obs = r[permitido].mean() - r[~permitido].mean()
    cnt = 0
    for _ in range(B):
        p = rng.permutation(permitido)
        if r[p].mean() - r[~p].mean() >= obs:
            cnt += 1
    return obs, cnt / B


def estado_en(df, estados, t_ms, modo):
    """Estado al cierre de la vela diaria de la señal (E022: la vela que termina justo antes de la entrada)."""
    i = np.searchsorted(df.t.values, np.asarray(t_ms, np.int64), side="right") - 2  # vela anterior a la de la entrada
    return np.where(i >= 0, estados[np.clip(i, 0, None)], -1)


if __name__ == "__main__":
    os.makedirs(SAL, exist_ok=True)
    df = variables()
    X_ = df[["lrv", "lgvz"]].values
    dev = (df.t >= C.ms("2010-11-15")) & (df.t < FIN_DEV)
    cands = {"E022 oro D1": C.e022("2011-11-15"),
             "ICT 5 oro": pd.concat([C.ict5_oro("2010-11-15", "2021-11-15", carga="2010-01-01"), C.ict5_oro()])}
    filas = []
    for k in (2, 3):
        m = regimen.HMMGaussiano(k=k, n_init=10, semilla=0).ajustar(X_[dev.values])
        P = m.filtrar(X_)
        est = P.argmax(axis=1)
        est[np.isnan(X_).any(axis=1)] = -1
        print(f"HMM {k} estados: medias {np.round(m.mu_, 2).tolist()} · BIC {m.bic():.0f}", flush=True)
        pd.DataFrame(dict(t=df.t, estado=est, **{f"p{j}": P[:, j] for j in range(k)})).to_csv(f"{SAL}/estados_k{k}.csv.gz", index=False)
        for nombre, ops in cands.items():
            e = estado_en(df, est, ops.t.values, "señal")
            o = ops.assign(estado=e)
            od, oc = o[o.t < FIN_DEV], o[o.t >= FIN_DEV]
            g = od.groupby("estado").r.agg(["size", "mean", lambda x: (x > 0).mean()])
            g.columns = ["n", "exp", "wr"]
            permit = [s for s in g.index if s >= 0 and g.loc[s, "exp"] > 0]
            if 0 < len(permit) < len([s for s in g.index if s >= 0]):
                obs, p = permutacion(od.r.values, od.estado.isin(permit).values)
            else:
                obs, p = np.nan, np.nan
            adopta = bool(p < 0.05) if np.isfinite(p) else False
            gc = oc.groupby("estado").r.agg(["size", "mean", lambda x: (x > 0).mean()])
            gc.columns = ["n", "exp", "wr"]
            exp_sin = oc.r.mean()
            exp_con = oc[oc.estado.isin(permit)].r.mean() if adopta else exp_sin
            var_wr = float(gc.wr.var()) if len(gc) > 1 else np.nan
            filas.append(dict(k=k, estrategia=nombre, estados_dev=g.round(3).to_dict("index"), permitidos=permit,
                              diferencia_dev=obs, p_permutacion=p, filtro_adoptado=adopta, n_conf=len(oc),
                              exp_conf_sin_filtro=exp_sin, exp_conf_con_filtro=exp_con,
                              n_conf_con_filtro=int(oc.estado.isin(permit).sum()) if adopta else len(oc),
                              estados_conf=gc.round(3).to_dict("index"), var_wr_entre_regimenes_conf=var_wr,
                              pasa=bool(adopta and exp_con >= 0.9 * exp_sin)))
            print(k, nombre, "permitidos", permit, "p", None if not np.isfinite(p) else round(p, 4), "adopta", adopta,
                  "| conf sin", round(exp_sin, 3), "con", round(exp_con, 3), flush=True)
            print("   dev por estado:", g.round(3).to_dict("index"), "\n   conf por estado:", gc.round(3).to_dict("index"), flush=True)
    t = pd.DataFrame(filas)
    t.to_csv(f"{SAL}/resumen.csv", index=False)
    registro.registrar("E034", __file__, hipotesis="Un régimen HMM causal mejora E022 o ICT 5", n_variantes=4, resultados=t)
