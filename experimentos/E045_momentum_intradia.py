"""
E045 — Momentum intradía del oro (BITACORA, entrada 37; Gao, Han, Li y Zhou 2018; Baltussen, Da, Lammers y Martens 2021).
Variantes (sin grilla):
  A30: señal = signo(cierre 16:59 NY del día anterior → 08:50 NY); operación 13:00–13:29 NY.
  B30: señal = signo(08:20 → 08:50 NY);                            operación 13:00–13:29 NY.
  A60: señal de A;                                                  operación 12:30–13:29 NY.
Entrada en la apertura del primer minuto, salida al cierre del último. Retorno neto en % por operación con costos base
(principal), conservador y docs/costos.md. Desarrollo 15/11/2010–14/11/2021; confirmación 15/11/2021–13/11/2026.
Si una variante pasa: placebo de dirección al azar (200 juegos) y meseta de horarios (12:55/13:05, 13:25/13:35).
"""
import os
import sys

import numpy as np
import pandas as pd
from scipy import stats

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from lab import datos, ejecucion as EJ, eventos as EV, multiples as MU, registro  # noqa: E402

SAL = "resultados/E045"
DEV = ("2010-11-15", "2021-11-15")
CONF = ("2021-11-15", "2026-11-14")
ms = lambda x: pd.Timestamp(x, tz="UTC").value // 10**6  # noqa: E731
hm = lambda h, m: h * 60 + m  # noqa: E731


class Dias:
    """Índices M1 por día calendario de NY y minuto del día, para buscar 'el minuto HH:MM' de cada día."""

    def __init__(self, m1):
        self.m1 = m1
        ny = pd.to_datetime(m1["t"], unit="ms", utc=True).tz_convert("America/New_York")
        self.fecha = ny.normalize().tz_localize(None).values.astype("datetime64[D]").astype(np.int64)
        self.min = (ny.hour * 60 + ny.minute).values.astype(np.int64)
        self.clave = self.fecha * 1440 + self.min  # minuto absoluto en hora local de NY (único y creciente)
        self.dias = np.unique(self.fecha)

    def indice(self, dias, minuto):
        """Índice M1 exacto de ese minuto de NY en cada día (-1 si no existe)."""
        q = dias * 1440 + minuto
        j = np.searchsorted(self.clave, q)
        j = np.clip(j, 0, len(self.clave) - 1)
        return np.where(self.clave[j] == q, j, -1)

    def cierre_anterior(self, dias):
        """Índice del minuto 16:59 NY del último día anterior con datos (el cierre diario)."""
        out = np.full(len(dias), -1)
        for k, d in enumerate(dias):
            for back in range(1, 5):
                j = self.indice(np.array([d - back]), hm(16, 59))[0]
                if j >= 0:
                    out[k] = j
                    break
        return out


def operaciones(D, senal, ent_min, sal_min, muestra_dias=None):
    m1 = D.m1
    dias = D.dias if muestra_dias is None else muestra_dias
    ie, js = D.indice(dias, ent_min), D.indice(dias, sal_min)
    if senal == "A":
        a, b = D.cierre_anterior(dias), D.indice(dias, hm(8, 50))
        r1 = np.where((a >= 0) & (b >= 0), m1["c"][np.clip(b, 0, None)] / m1["c"][np.clip(a, 0, None)] - 1, np.nan)
    else:
        a, b = D.indice(dias, hm(8, 20)), D.indice(dias, hm(8, 50))
        r1 = np.where((a >= 0) & (b >= 0), m1["c"][np.clip(b, 0, None)] / m1["o"][np.clip(a, 0, None)] - 1, np.nan)
    ok = (ie >= 0) & (js > ie) & np.isfinite(r1) & (r1 != 0)
    ie, js, r1 = ie[ok], js[ok], r1[ok]
    d = np.sign(r1).astype(int)
    ent, sal = m1["o"][ie], m1["c"][js]
    return pd.DataFrame(dict(t=m1["t"][ie], t_salida=m1["t"][js] + 60000, dir=d, entrada=ent, salida=sal, sl=ent * (1 - 0.01 * d),
                             motivo=2, r1=r1, r_ventana=sal / ent - 1))


def netos(ops, vol):
    out = {}
    for perfil in ("base", "conservador", "costos.md"):
        c = np.asarray(datos.costo("XAUUSD", ops.entrada.values), float) if perfil == "costos.md" else EJ.costos(ops, "XAUUSD", vol, perfil)
        out[perfil] = ops.dir.values * (ops.salida.values - ops.entrada.values) / ops.entrada.values - c / ops.entrada.values
    return out


def resumen(ops, nets):
    f = {}
    for mu, (a, b) in (("dev", DEV), ("conf", CONF)):
        m = ((ops.t >= ms(a)) & (ops.t < ms(b))).values
        v = nets["base"][m]
        n = len(v)
        f.update({f"{mu}_n": n, f"{mu}_ret_pct": 100 * v.mean(), f"{mu}_wr": float((v > 0).mean()),
                  f"{mu}_p": float(MU.p_media_positiva(v.mean(), v.std(ddof=1), n)),
                  f"{mu}_cons_pct": 100 * nets["conservador"][m].mean(), f"{mu}_costosmd_pct": 100 * nets["costos.md"][m].mean(),
                  f"{mu}_beta": float(stats.linregress(ops.r1.values[m], ops.r_ventana.values[m]).slope)})
    m = ((ops.t >= ms(CONF[0])) & (ops.t < ms(CONF[1]))).values
    t = pd.DatetimeIndex(pd.to_datetime(ops.t.values[m], unit="ms", utc=True))
    anio = np.where((t.month > 11) | ((t.month == 11) & (t.day >= 15)), t.year, t.year - 1)
    s = pd.Series(nets["base"][m]).groupby(anio).sum()
    f["conf_anios_pos"] = int((s > 0).sum())
    f["conf_anios"] = {int(k): round(100 * float(x), 2) for k, x in s.items()}
    return f


if __name__ == "__main__":
    os.makedirs(SAL, exist_ok=True)
    m1 = datos.cargar("XAUUSD")
    vol = EJ.Volatilidad(m1)
    D = Dias(m1)
    VAR = {"A30": ("A", hm(13, 0), hm(13, 29)), "B30": ("B", hm(13, 0), hm(13, 29)), "A60": ("A", hm(12, 30), hm(13, 29))}
    filas, ops_v = [], {}
    for nombre, (sen, a, b) in VAR.items():
        ops = operaciones(D, sen, a, b)
        nets = netos(ops, vol)
        ops_v[nombre] = (ops, nets)
        f = dict(variante=nombre, **resumen(ops, nets))
        filas.append(f)
        print({k: (round(x, 5) if isinstance(x, float) else x) for k, x in f.items()}, flush=True)
    t = pd.DataFrame(filas)
    t["holm_dev"] = MU.holm(t.dev_p.values, 0.05)
    t["pasa"] = (t.holm_dev & (t.dev_ret_pct > 0) & (t.conf_ret_pct > 0) & (t.conf_p < 0.10) & (t.conf_anios_pos >= 4) & (t.conf_n >= 100)
                 & (t.dev_cons_pct > 0) & (t.conf_cons_pct > 0))
    t.to_csv(f"{SAL}/resumen.csv", index=False)
    print(t[["variante", "dev_n", "dev_ret_pct", "dev_p", "holm_dev", "dev_beta", "conf_n", "conf_ret_pct", "conf_p", "conf_anios_pos",
             "dev_cons_pct", "conf_cons_pct", "pasa"]].to_string(), flush=True)
    solidez = {}
    for _, f in t[t.pasa].iterrows():
        sen, a, b = VAR[f.variante]
        ops, nets = ops_v[f.variante]
        m = ((ops.t >= ms(CONF[0])) & (ops.t < ms(CONF[1]))).values
        rng = np.random.default_rng(0)
        bruto = (ops.salida.values - ops.entrada.values) / ops.entrada.values
        costo = ops.dir.values * bruto - nets["base"]  # costo por operación (no depende de la dirección)
        pl = [float(np.mean(rng.choice([-1, 1], m.sum()) * bruto[m] - costo[m])) for _ in range(200)]
        mes = {}
        for na, nb in ((a - 5, b), (a + 5, b), (a, b - 4), (a, b + 6)):
            o2 = operaciones(D, sen, na, nb)
            r = resumen(o2, netos(o2, vol))
            mes[f"{na // 60:02d}:{na % 60:02d}-{nb // 60:02d}:{nb % 60:02d}"] = (round(r["dev_ret_pct"], 4), round(r["conf_ret_pct"], 4))
        solidez[f.variante] = dict(placebo_p95_pct=100 * float(np.percentile(pl, 95)), placebo_ok=bool(f.conf_ret_pct / 100 > np.percentile(pl, 95)),
                                   meseta=mes, meseta_ok=all(x > 0 and y > 0 for x, y in mes.values()))
        print("SOLIDEZ", f.variante, solidez[f.variante], flush=True)
    registro.registrar("E045", __file__, hipotesis="Momentum intradía del oro (cierre del COMEX)", universo="XAUUSD M1", n_variantes=3,
                       resultados=t, solidez=solidez)
