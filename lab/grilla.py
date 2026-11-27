"""
Familias de señales para la búsqueda exhaustiva (E019).

Cada familia recibe velas v (dict t, o, h, l, c, i0, i1) y devuelve un array int (+1 / -1 / 0) por vela, con la señal
al cierre de esa vela. Las definiciones siguen a TradingView para poder reproducirlas en Pine: ta.sma, ta.ema,
ta.rsi y ta.atr con RMA, desvío estándar sesgado en Bollinger, ta.dmi para el ADX y ta.supertrend.

variantes(v, tf) devuelve la lista (familia, parámetros, tipo, señal) con tipo:
- "estado": condición que dura varias velas (se prueba en modo estado y en modo cambio);
- "evento": una sola vela;
- "siempre": control (comprar o vender siempre).
"""
import numpy as np
import pandas as pd
from numba import njit

from lab import senales as S

USA_SMA200 = {"tendencia", "sobre_sma", "rsi2_tend", "minimo_tend", "tres_velas"}  # familias que ya filtran con la SMA 200


def _signo(x):
    return np.where(np.isnan(x), 0, np.sign(x)).astype(np.int8)


def _prev(x, n=1, relleno=np.nan):
    x = np.asarray(x, float)
    return np.concatenate([np.full(n, relleno), x[:-n]])


def rma(x, n):
    return pd.Series(x).ewm(alpha=1.0 / n, adjust=False, min_periods=n).mean().values


def true_range(v):
    pc = _prev(v["c"], 1, v["c"][0])
    return np.maximum(v["h"] - v["l"], np.maximum(np.abs(v["h"] - pc), np.abs(v["l"] - pc)))


@njit(cache=True)
def _supertrend(h, l, c, atr, factor):
    n = len(c)
    out = np.zeros(n, np.int8)
    up_prev = np.nan
    lo_prev = np.nan
    st_prev = np.nan
    direc = 1
    for i in range(n):
        if np.isnan(atr[i]):
            continue
        src = (h[i] + l[i]) / 2.0
        up = src + factor * atr[i]
        lo = src - factor * atr[i]
        if not np.isnan(lo_prev):
            if not (lo > lo_prev or c[i - 1] < lo_prev):
                lo = lo_prev
            if not (up < up_prev or c[i - 1] > up_prev):
                up = up_prev
        if np.isnan(st_prev):
            direc = 1
        elif st_prev == up_prev:
            direc = -1 if c[i] > up else 1
        else:
            direc = 1 if c[i] < lo else -1
        st = lo if direc == -1 else up
        out[i] = 1 if direc == -1 else -1  # en TradingView direction = -1 es tendencia alcista
        up_prev, lo_prev, st_prev = up, lo, st
    return out


def supertrend(v, n=10, factor=3.0):
    return _supertrend(v["h"], v["l"], v["c"], rma(true_range(v), n), factor)


def adx_estado(v, n=14, umbral=25.0):
    h, l = v["h"], v["l"]
    up = h - _prev(h)
    dn = _prev(l) - l
    pdm = np.where((up > dn) & (up > 0), up, 0.0)
    mdm = np.where((dn > up) & (dn > 0), dn, 0.0)
    tr = rma(true_range(v), n)
    with np.errstate(divide="ignore", invalid="ignore"):
        pdi = 100 * rma(pdm, n) / tr
        mdi = 100 * rma(mdm, n) / tr
        dx = 100 * np.abs(pdi - mdi) / (pdi + mdi)
    adx = rma(np.nan_to_num(dx), n)
    return np.where(adx > umbral, _signo(pdi - mdi), 0).astype(np.int8)


def _cruce_arriba(a, b):
    return (a > b) & (_prev(a) <= _prev(b))


def sesion(v, ini, fin, desde, hasta):
    """Ruptura de un rango de sesión (minutos del día en Nueva York). Primer cierre fuera del rango en [desde, hasta)."""
    ny = pd.to_datetime(v["t"], unit="ms", utc=True).tz_convert("America/New_York")
    mn = (ny.hour * 60 + ny.minute).values
    dia = ny.tz_localize(None).normalize().values
    if ini > fin:  # el rango cruza la medianoche: sus velas de la noche pertenecen al día siguiente
        dia = np.where(mn >= ini, dia + np.timedelta64(1, "D"), dia)
        en_rango = (mn >= ini) | (mn < fin)
    else:
        en_rango = (mn >= ini) & (mn < fin)
    df = pd.DataFrame(dict(dia=dia, h=v["h"], l=v["l"], c=v["c"]))
    rng = df[en_rango].groupby("dia").agg(H=("h", "max"), L=("l", "min"))
    df = df.join(rng, on="dia")
    ventana = (mn >= desde) & (mn < hasta) & df.H.notna().values
    s = np.where(ventana & (df.c.values > df.H.values), 1, np.where(ventana & (df.c.values < df.L.values), -1, 0))
    primera = pd.Series(s != 0).groupby(dia).cumsum().values == 1
    return np.where(primera & (s != 0), s, 0).astype(np.int8)


def variantes(v, tf):
    c, o, h, l = v["c"], v["o"], v["h"], v["l"]
    out = []
    t200 = S.sobre_sma(v, 200)
    t50 = S.sobre_sma(v, 50)
    # --- estado
    for n in (20, 50, 100, 200):
        out.append(("sobre_sma", f"{n}", "estado", S.sobre_sma(v, n)))
    for n in (50, 200):
        out.append(("tendencia", f"{n}", "estado", S.tendencia(v, n, 20)))
    for f, s in ((9, 21), (20, 50), (50, 200)):
        out.append(("cruce_ema", f"{f}/{s}", "estado", _signo(S.ema(c, f) - S.ema(c, s))))
    for n in (10, 20, 60, 120):
        out.append(("momentum", f"{n}", "estado", S.momentum(v, n)))
    for n in (20, 55):
        out.append(("donchian_estado", f"{n}", "estado", S.donchian_estado(v, n)))
    out.append(("adx", "14/25", "estado", adx_estado(v)))
    out.append(("supertrend", "10/3", "estado", supertrend(v)))
    # --- eventos
    for n in (10, 20, 55):
        out.append(("ruptura_donchian", f"{n}", "evento", S.donchian_ruptura(v, n)))
    r2 = S.rsi(c, 2)
    for b in (5, 10, 25):
        out.append(("rsi2_tend", f"{b}", "evento", np.where((r2 < b) & (t200 == 1), 1, np.where((r2 > 100 - b) & (t200 == -1), -1, 0))))
    r14 = S.rsi(c, 14)
    for lv in (30, 20):
        arriba = (r14 >= lv) & (_prev(r14) < lv)
        abajo = (r14 <= 100 - lv) & (_prev(r14) > 100 - lv)
        out.append(("rsi14_vuelve", f"{lv}/{100 - lv}", "evento", np.where(arriba, 1, np.where(abajo, -1, 0))))
    m20 = S.sma(c, 20)
    sd = pd.Series(c).rolling(20, min_periods=20).std(ddof=0).values
    bs, bi = m20 + 2 * sd, m20 - 2 * sd
    fuera_arriba = (c > bs) & ~(_prev(c) > _prev(bs))
    fuera_abajo = (c < bi) & ~(_prev(c) < _prev(bi))
    out.append(("bollinger_reversion", "20/2", "evento", np.where(fuera_abajo, 1, np.where(fuera_arriba, -1, 0))))
    out.append(("bollinger_ruptura", "20/2", "evento", np.where(fuera_arriba, 1, np.where(fuera_abajo, -1, 0))))
    for n in (3, 5, 10):
        mn = pd.Series(c).rolling(n).min().values
        mx = pd.Series(c).rolling(n).max().values
        out.append(("minimo_tend", f"{n}", "evento", np.where((c <= mn) & (t200 == 1), 1, np.where((c >= mx) & (t200 == -1), -1, 0))))
    inside = (h < _prev(h)) & (l > _prev(l))
    out.append(("inside_bar", "sma50", "evento", np.where(inside, t50, 0)))
    rng = h - l
    nr7 = rng <= pd.Series(rng).rolling(7).min().values
    out.append(("nr7", "sma50", "evento", np.where(nr7 & (rng > 0), t50, 0)))
    po, pc = _prev(o), _prev(c)
    alc = (c > o) & (pc < po) & (c >= po) & (o <= pc)
    baj = (c < o) & (pc > po) & (c <= po) & (o >= pc)
    out.append(("envolvente", "-", "evento", np.where(alc, 1, np.where(baj, -1, 0))))
    mecha_inf = np.minimum(o, c) - l
    mecha_sup = h - np.maximum(o, c)
    with np.errstate(divide="ignore", invalid="ignore"):
        martillo = (rng > 0) & (mecha_inf >= 0.6 * rng) & (mecha_sup <= 0.2 * rng)
        estrella = (rng > 0) & (mecha_sup >= 0.6 * rng) & (mecha_inf <= 0.2 * rng)
    out.append(("martillo", "60/20", "evento", np.where(martillo, 1, np.where(estrella, -1, 0))))
    p1, p2, p3 = _prev(c, 1), _prev(c, 2), _prev(c, 3)
    baja3 = (c < p1) & (p1 < p2) & (p2 < p3)
    sube3 = (c > p1) & (p1 > p2) & (p2 > p3)
    out.append(("tres_velas", "-", "evento", np.where(baja3 & (t200 == 1), 1, np.where(sube3 & (t200 == -1), -1, 0))))
    macd = S.ema(c, 12) - S.ema(c, 26)
    sig = pd.Series(macd).ewm(span=9, adjust=False, min_periods=9).mean().values
    out.append(("macd", "12/26/9", "evento", np.where(_cruce_arriba(macd, sig), 1, np.where(_cruce_arriba(sig, macd), -1, 0))))
    ll = pd.Series(l).rolling(14).min().values
    hh = pd.Series(h).rolling(14).max().values
    with np.errstate(divide="ignore", invalid="ignore"):
        k_ = 100 * (c - ll) / (hh - ll)
    ks = S.sma(k_, 3)
    out.append(("estocastico", "14/3", "evento", np.where((ks > 20) & (_prev(ks) <= 20), 1, np.where((ks < 80) & (_prev(ks) >= 80), -1, 0))))
    if tf <= 15:
        out.append(("ruptura_apertura_ny", "09:30-10:00", "evento", sesion(v, 570, 600, 600, 720)))
        out.append(("ruptura_rango_asia", "19:00-00:00", "evento", sesion(v, 1140, 0, 120, 300)))
    out.append(("siempre", "-", "siempre", np.ones(len(c), np.int8)))
    return [(f, p, tipo, np.asarray(s, np.int8)) for f, p, tipo, s in out]


TF_MIN = {"M5": 5, "M15": 15, "H1": 60, "H4": 240, "D1": 1440}


def operaciones_config(instr, tf, familia, param, modo, filtro, direccion, k, desde, hasta=None, rr=2.0, costo_mult=1.0,
                       carga_desde=None, m1=None):
    """Vuelve a simular una sola combinación de E019 entre `desde` y `hasta` (ms UTC). Devuelve un DataFrame de operaciones."""
    from lab import datos, motor
    if m1 is None:
        m1 = datos.cargar(instr)
        if carga_desde is not None:
            a = np.searchsorted(m1["t"], carga_desde)
            m1 = {kk: vv[a:] for kk, vv in m1.items()}
    tfm = TF_MIN[tf]
    v = datos.velas(m1, tfm)
    nb = len(v["t"])
    atr = datos.atr(v, 14)
    s = {(f, p): sig for f, p, _, sig in variantes(v, tfm)}[(familia, str(param))]
    if familia == "siempre":
        s = np.ones(nb, np.int8) if direccion == "largos" else -np.ones(nb, np.int8)
    if modo == "cambio":
        s = np.where(s != np.concatenate([[0], s[:-1]]), s, 0)
    if filtro == "sma200":
        s = np.where(s == S.sobre_sma(v, 200), s, 0)
    elif filtro == "d1":
        d1 = datos.velas(m1, 1440)
        q = np.searchsorted(d1["i1"], v["i1"], side="right") - 1
        fd1 = np.where(q >= 0, S.sobre_sma(d1, 200)[np.clip(q, 0, None)], 0)
        s = np.where(s == fd1, s, 0)
    if direccion == "largos":
        s = np.where(s == 1, s, 0)
    elif direccion == "cortos":
        s = np.where(s == -1, s, 0)
    ok = (s != 0) & ~np.isnan(atr) & (v["t"] >= desde) & (np.arange(nb) < nb - 1)
    if hasta is not None:
        ok &= v["t"] < hasta
    sel = np.flatnonzero(ok)
    ie = v["i1"][sel] + 1
    d = s[sel].astype(np.int64)
    ent = m1["o"][ie]
    riesgo = k * atr[sel]
    ops = motor.simular(m1, ie, d, ent - d * riesgo, ent + d * rr * riesgo, costo_mult * datos.costo(instr, ent))
    m = ops["motivo"] != 3
    out = pd.DataFrame({kk: ops[kk][m] for kk in ("t", "t_salida", "dir", "entrada", "sl", "tp", "salida", "motivo", "r")})
    out["senal_t"] = v["t"][sel][ops["idx_senal"][m]]
    out["atr"] = atr[sel][ops["idx_senal"][m]]
    return out
