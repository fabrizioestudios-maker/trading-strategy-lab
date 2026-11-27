"""
Exporta los datos del tablero del laboratorio (artifact "Tablero del laboratorio") desde resultados/.
Escribe resultados/tablero/<dataset>.json con {rows, meta}; meta lleva este mismo código y los archivos de origen.

Uso: python herramientas/exportar_tablero.py
"""
import json
import os

import numpy as np
import pandas as pd

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SAL = os.path.join(RAIZ, "resultados", "tablero")
CODIGO = open(os.path.abspath(__file__), encoding="utf-8").read()


def leer(ruta):
    return pd.read_csv(os.path.join(RAIZ, ruta))


def limpio(x):
    if isinstance(x, (float, np.floating)):
        return None if not np.isfinite(x) else round(float(x), 4)
    if isinstance(x, (np.integer,)):
        return int(x)
    return x


def escribir(nombre, filas, fuentes):
    os.makedirs(SAL, exist_ok=True)
    meta = [{"label": "exportar_tablero.py", "value": CODIGO, "type": "code", "lang": "python"},
            {"label": "Archivos de origen", "value": ", ".join(fuentes)}]
    filas = [{k: limpio(v) for k, v in f.items()} for f in filas]
    with open(os.path.join(SAL, f"{nombre}.json"), "w", encoding="utf-8") as fh:
        json.dump({"rows": filas, "meta": meta}, fh, ensure_ascii=False)
    print(nombre, len(filas))


def estrategias():
    e27 = leer("resultados/E027/resumen.csv").set_index("ventana")
    tas = leer("resultados/E029/tasacion.csv")
    per = leer("resultados/E030/resumen.csv").set_index("estrategia")
    lim = leer("resultados/E038/resumen.csv")
    lim = lim[lim.llenado == "histórico"].set_index("estrategia")

    def ir(nombre, bench):
        x = tas[(tas.estrategia == nombre) & (tas.benchmark == bench)]
        return (float(x.ir_tasacion.iloc[0]), float(x.p_alfa.iloc[0])) if len(x) else (np.nan, np.nan)

    lo, hi = [float(v) for v in e27.loc["15 años", "ic"].split("..")]
    filas = [
        dict(estrategia="Oro D1 · Bollinger + SMA 200 (E022)", nivel="B", nivel_nombre="Candidata", periodo="2011-11 a 2026-11",
             n=int(e27.loc["15 años", "n"]), wr=e27.loc["15 años", "wr"], exp_publicada=e27.loc["15 años", "exp"], ic_lo=lo, ic_hi=hi,
             exp_base=per.loc["E022 oro D1", "exp_base"],
             ir=ir("E022 oro D1", "oro comprar y mantener")[0], p_ir=ir("E022 oro D1", "oro comprar y mantener")[1],
             exp_conservador=per.loc["E022 oro D1", "exp_conservador"], exp_limpia=np.nan,
             limpia="pendiente: E037 bloqueado por Yahoo; prueba a futuro F001 desde el 27/11/2026"),
        dict(estrategia="ICT setup 5 en oro (E025)", nivel="A", nivel_nombre="Exploratoria", periodo="2021-11 a 2026-11",
             n=82, wr=0.4512, exp_publicada=0.3041, ic_lo=np.nan, ic_hi=np.nan, exp_base=per.loc["ICT 5 oro (2010–2026)", "exp_base"],
             ir=ir("ICT 5 oro (2010–2026)", "oro comprar y mantener")[0], p_ir=ir("ICT 5 oro (2010–2026)", "oro comprar y mantener")[1],
             exp_conservador=per.loc["ICT 5 oro (2010–2026)", "exp_conservador"], exp_limpia=lim.loc["ICT 5 oro", "exp"],
             limpia=f"no pasó: {int(lim.loc['ICT 5 oro', 'n'])} operaciones en 2010–2021"),
        dict(estrategia="SMC mejor en oro (E024)", nivel="R", nivel_nombre="Rechazada", periodo="2021-11 a 2026-11",
             n=302, wr=0.4338, exp_publicada=0.2593, ic_lo=np.nan, ic_hi=np.nan, exp_base=per.loc["SMC oro (2010–2026)", "exp_base"],
             ir=ir("SMC oro (2010–2026)", "oro comprar y mantener")[0], p_ir=ir("SMC oro (2010–2026)", "oro comprar y mantener")[1],
             exp_conservador=per.loc["SMC oro (2010–2026)", "exp_conservador"], exp_limpia=lim.loc["SMC oro", "exp"],
             limpia=f"no pasó: {int(lim.loc['SMC oro', 'n'])} operaciones en 2010–2021"),
        dict(estrategia="Candidata B · tendencia 200, 8 activos (E009)", nivel="A", nivel_nombre="Exploratoria", periodo="2011-11 a 2026-11",
             n=int(per.loc["candidata B (8 activos)", "n"]), wr=np.nan, exp_publicada=np.nan, ic_lo=np.nan, ic_hi=np.nan,
             exp_base=per.loc["candidata B (8 activos)", "exp_base"],
             ir=ir("candidata B (tendencia, 8 activos)", "risk parity (7 índices + oro)")[0],
             p_ir=ir("candidata B (tendencia, 8 activos)", "risk parity (7 índices + oro)")[1],
             exp_conservador=per.loc["candidata B (8 activos)", "exp_conservador"], exp_limpia=np.nan,
             limpia="1990–2009 con Yahoo: no comparable (la fuente no reprodujo HistData)"),
        dict(estrategia="Líderes de momentum + mínimo 10 d (E017)", nivel="A", nivel_nombre="Exploratoria", periodo="2010-11 a 2021-12",
             n=int(per.loc["líderes (hasta 2021)", "n"]), wr=np.nan, exp_publicada=np.nan, ic_lo=np.nan, ic_hi=np.nan,
             exp_base=per.loc["líderes (hasta 2021)", "exp_base"],
             ir=ir("líderes top 3 + mínimo 10 d (hasta 2021)", "risk parity (7 índices + oro)")[0],
             p_ir=ir("líderes top 3 + mínimo 10 d (hasta 2021)", "risk parity (7 índices + oro)")[1],
             exp_conservador=per.loc["líderes (hasta 2021)", "exp_conservador"], exp_limpia=np.nan,
             limpia="su validación 2022–2026 sigue sin tocar"),
    ]
    escribir("estrategias", filas, ["resultados/E027/resumen.csv", "resultados/E029/tasacion.csv", "resultados/E030/resumen.csv",
                                    "resultados/E038/resumen.csv"])


def curva():
    a = leer("resultados/E022/operaciones_2011_2021.csv")
    b = leer("resultados/E022/operaciones_5a.csv")
    o = pd.concat([a, b]).sort_values("entrada_utc").reset_index(drop=True)
    o["r_acum"] = o.r.cumsum()
    filas = [dict(n=i + 1, fecha=r.dia_senal, direccion=r.direccion, resultado=r.resultado, r=r.r, r_acum=r.r_acum)
             for i, r in o.iterrows()]
    escribir("curva_e022", filas, ["resultados/E022/operaciones_2011_2021.csv", "resultados/E022/operaciones_5a.csv"])


def perfiles():
    p = leer("resultados/E030/perfiles.csv")
    nombres = {"sin_costos": "Sin costos", "optimista": "Optimista", "base": "Base", "conservador": "Conservador", "estres": "Estrés"}
    filas = [dict(estrategia=r.estrategia, perfil=nombres.get(r.perfil, r.perfil), orden=list(nombres).index(r.perfil), exp=r.exp, n=r.n)
             for r in p.itertuples()]
    escribir("perfiles", filas, ["resultados/E030/perfiles.csv"])


def experimentos():
    filas = [
        dict(id="E038", pregunta="¿ICT 5 y SMC del oro funcionan en su historia nunca usada (2010–2021)?", veredicto="no",
             resultado="ICT 5: 215 operaciones, +0,035 R (p 0,36). SMC: 613, −0,027 R."),
        dict(id="E035b", pregunta="¿Un barrido de liquidez predice la reversión?", veredicto="no",
             resultado="Contra operar a la misma hora otro día: diferencia ≈ 0 en los 4 niveles; los barridos pierden de −0,04 a −0,16 R."),
        dict(id="E035a", pregunta="¿Qué componente del setup SMC suma?", veredicto="informativo",
             resultado="Suman la liquidez del día anterior (+0,09 R) y las killzones (+0,03 R); entrar en FVG u OB resta (−0,05 a −0,08 R)."),
        dict(id="E034", pregunta="¿Un régimen HMM sin mirar adelante mejora las candidatas?", veredicto="débil",
             resultado="Oro D1 no lo necesita. ICT 5 solo con volatilidad alta: p 0,0495, no sobrevive a Holm."),
        dict(id="E033", pregunta="¿El COT por participante o el intermercado predicen?", veredicto="no",
             resultado="IC de −0,04 a +0,02 en las 6 señales; la tasa real se dio vuelta en la confirmación."),
        dict(id="E032", pregunta="¿Cuánto riesgo aguanta la candidata?", veredicto="informativo",
             resultado="Oro D1 con 1 % y costos conservadores: drawdown p95 de 11,7 % en 5 años, ruina 0."),
        dict(id="E031", pregunta="¿Algo sobrevive a la corrección por pruebas múltiples?", veredicto="no",
             resultado="0 de 297.354 configuraciones con Holm, BH o BY; SPA de Hansen en D1: p = 0,21."),
        dict(id="E030", pregunta="¿La ventaja resiste costos realistas?", veredicto="sí (oro D1)",
             resultado="Oro D1: +0,37 R base y +0,27 R estrés. Candidata B y líderes se dan vuelta por los swaps."),
        dict(id="E029", pregunta="¿Agrega alfa sobre una cartera pasiva con los mismos costos?", veredicto="sí (oro D1)",
             resultado="Oro D1: IR de tasación 0,85 (p 0,001), correlación con el oro 0,03. Nadie más pasa."),
        dict(id="E028", pregunta="¿Elegir solo con el pasado funciona (walk-forward)?", veredicto="no",
             resultado="Familia del oro: +0,53 R fuera de muestra pero razón 0,34 < 0,5; al azar en la familia, +0,22 R."),
        dict(id="E036", pregunta="¿Tendencia multiactivo con volatilidad objetivo?", veredicto="no",
             resultado="Sharpe 0,21 contra 0,61 del risk parity en 2010–2026 (0,94 en 1990–2009)."),
        dict(id="E037", pregunta="¿El oro D1 funciona en 2005–2011 con GLD?", veredicto="pendiente",
             resultado="Listo para correr; Yahoo limita los pedidos desde el 27/11/2026 08:20 UTC."),
        dict(id="E018", pregunta="¿Las candidatas funcionan en 1990–2009?", veredicto="no evaluable",
             resultado="Yahoo no reproduce HistData; informativo: la tendencia gana 50 % contra 37,5 % en 2000–2009."),
        dict(id="F001", pregunta="Prueba a futuro de oro D1 e ICT 5", veredicto="en curso",
             resultado="Sellada el 27/11/2026 con hash del código; decisión a las 30 operaciones."),
    ]
    escribir("experimentos", filas, ["BITACORA.md (entrada 30)"])


if __name__ == "__main__":
    estrategias()
    curva()
    perfiles()
    experimentos()
