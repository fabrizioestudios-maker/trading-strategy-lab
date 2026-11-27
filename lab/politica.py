"""
Política de aceptación centralizada (docs/criterios_v2.md, fijada el 27/11/2026 antes de correr E026–E027).
Los experimentos nuevos importan estos umbrales; los experimentos E000–E025 conservan sus criterios históricos.

- MISION_A: la misión original (docs/criterios.md), sin cambios: win rate ≥ 50 % con payoff real ≥ 2.
- Categoría A (ventaja robusta), B (candidata) y C (sin evidencia suficiente): escala para cualquier perfil de acierto.
  clasificar() devuelve la categoría y la lista de condiciones que fallaron, para que el ranking sea explicable.
"""
MISION_A = dict(wr_min=0.50, payoff_min=2.0, exp_min=0.0, n_min=100, n_val_min=30)

CATEGORIA_A = dict(
    exp_min=0.15,        # expectancy neta por operación (R): cubre errores de modelo de costos de ~0,1 R
    ic_inf_min=0.0,      # límite inferior del IC 95 % (bootstrap) de la expectancy en todo el período disponible
    pf_min=1.3,
    n_min=150,           # con n = 150, el error estándar de la expectancy (sd ≈ 1,4 R) es ≈ 0,11 R
    p_azar_max=0.05,     # contra entradas al azar equivalentes (mismo SL/TP, lado y frecuencia)
    dsr_min=0.95,        # Deflated Sharpe Ratio con el N efectivo de la búsqueda que la eligió
    gen_ratio_min=0.5,   # expectancy en confirmación / expectancy en elección
    exp_costo_min=0.0,   # expectancy con costos × 1,5 (o el estrés que fije el experimento)
    anios_pos_min=0.70,  # proporción de años con resultado positivo
    holdout_n_min=30,    # operaciones en un período nunca usado (o prueba a futuro) con expectancy > 0
)
CATEGORIA_B = dict(exp_min=0.0, n_min=50, p_azar_max=0.10, gen_ratio_min=0.0)


def _chk(fallas, cond, texto):
    if not cond:
        fallas.append(texto)


def clasificar(ev):
    """ev: dict con n, exp, ic_inf, pf, p_azar, dsr, exp_is, exp_oos, exp_costo, anios_pos, holdout_n, holdout_exp.
    Los valores ausentes cuentan como no demostrados."""
    g = lambda k: ev.get(k)  # noqa: E731
    gen = (g("exp_oos") / g("exp_is")) if g("exp_is") not in (None, 0) and g("exp_oos") is not None else None
    a = CATEGORIA_A
    fa = []
    _chk(fa, (g("exp") or -1) >= a["exp_min"], f"expectancy < {a['exp_min']} R")
    _chk(fa, g("ic_inf") is not None and g("ic_inf") > a["ic_inf_min"], "IC 95 % de la expectancy incluye 0")
    _chk(fa, (g("pf") or 0) >= a["pf_min"], f"PF < {a['pf_min']}")
    _chk(fa, (g("n") or 0) >= a["n_min"], f"menos de {a['n_min']} operaciones")
    _chk(fa, g("p_azar") is not None and g("p_azar") < a["p_azar_max"], f"no le gana al azar con p < {a['p_azar_max']}")
    _chk(fa, g("dsr") is not None and g("dsr") >= a["dsr_min"], f"DSR < {a['dsr_min']}")
    _chk(fa, gen is not None and gen >= a["gen_ratio_min"], f"confirmación / elección < {a['gen_ratio_min']}")
    _chk(fa, g("exp_costo") is not None and g("exp_costo") > a["exp_costo_min"], "no resiste el estrés de costos")
    _chk(fa, g("anios_pos") is not None and g("anios_pos") >= a["anios_pos_min"], "menos del 70 % de años positivos")
    _chk(fa, (g("holdout_n") or 0) >= a["holdout_n_min"] and (g("holdout_exp") or -1) > 0, "sin período nunca usado (o prueba a futuro) positivo")
    if not fa:
        return "A", []
    b = CATEGORIA_B
    fb = []
    _chk(fb, (g("exp") or -1) > b["exp_min"], "expectancy ≤ 0")
    _chk(fb, (g("n") or 0) >= b["n_min"], f"menos de {b['n_min']} operaciones")
    _chk(fb, g("p_azar") is None or g("p_azar") < b["p_azar_max"], f"no le gana al azar con p < {b['p_azar_max']}")
    _chk(fb, gen is None or gen > b["gen_ratio_min"], "pierde en la confirmación")
    return ("B", fa) if not fb else ("C", fb + fa)


def cumple_mision_a(wr, payoff, exp, n_total, n_val):
    m = MISION_A
    return wr >= m["wr_min"] and payoff >= m["payoff_min"] and exp > m["exp_min"] and n_total >= m["n_min"] and n_val >= m["n_val_min"]
