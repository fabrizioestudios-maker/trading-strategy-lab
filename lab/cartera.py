"""
Cartera de estrategias (fase 4, E032): combina resultados diarios en R de varias estrategias con un riesgo por
operación para cada una y mide correlaciones, riesgo simultáneo, drawdown conjunto y diversificación.

Retorno diario de la cartera ≈ Σ f_i · R_i,t (riesgo fijo sobre el capital del día; las operaciones de varios días se
marcan a mercado con benchmarks.diario_mtm). Riesgo simultáneo = Σ f_i · (operaciones abiertas de i ese día): el
peor caso si todas tocaran su SL a la vez. Ratio de diversificación = Σ w_i σ_i / σ_cartera (1 = sin diversificación).
"""
import numpy as np
import pandas as pd

from lab.benchmarks import metricas_serie


def alinear(series):
    df = pd.concat(series, axis=1).fillna(0.0)
    return df.sort_index()


def combinar(series_r, riesgos):
    df = alinear(series_r)
    f = pd.Series(riesgos).reindex(df.columns).fillna(0.0)
    return (df * f).sum(axis=1), df


def resumen(series_r, abiertas, riesgos):
    port, df = combinar(series_r, riesgos)
    f = pd.Series(riesgos).reindex(df.columns).fillna(0.0)
    ab = alinear(abiertas).reindex(df.index).fillna(0.0)
    simult = (ab * f.reindex(ab.columns).fillna(0.0)).sum(axis=1)
    contrib = df * f
    sig = contrib.std()
    div = float(sig.sum() / port.std()) if port.std() > 0 else np.nan
    m = metricas_serie(port)
    return dict(correlaciones=df.corr(), riesgo_simultaneo_max=float(simult.max()),
                riesgo_simultaneo_p99=float(simult.quantile(0.99)), dias_con_2_o_mas=float((ab.gt(0).sum(axis=1) >= 2).mean()),
                diversificacion=div, **m), port
