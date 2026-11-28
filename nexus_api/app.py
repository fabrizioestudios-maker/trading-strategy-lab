"""
API de NEXUS (FastAPI). Rutas bajo /api/v1; la interfaz compilada (nexus_web/dist) se sirve desde el mismo proceso.

    python -m nexus_api            # http://127.0.0.1:8800
"""
from __future__ import annotations

import os
import time

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from . import CONTRATO, VERSION, biblioteca, probador, catalogo, estrategias as E022, indicadores as IND, mercados, referencias, riesgo, sesiones as SE, simulacion
from .contratos import (PedidoProbador, ResultadoProbador, DefinicionIndicador, PedidoIndicadores, RespuestaIndicadores, CalculoRiesgo, ConfigCorrida, CuentaSimulada, FichaMercado, HorarioMercado, PedidoCuenta, ContextoInvestigacion, CuadroReplay, EstadoOrdenSimulada, Estrategia,
                        Hipotesis, InformeCalidad, Instrumento, Paso, PedidoOrdenes, PedidoRiesgo, Referencias, Resumen, Salud,
                        Trabajo)
from .datos import TEMPORALIDADES, DatosNoDisponibles, ServicioDatos
from .trabajos import GestorTrabajos

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WEB = os.path.join(RAIZ, "nexus_web", "dist")


def crear_app(svc: ServicioDatos | None = None, gestor: GestorTrabajos | None = None) -> FastAPI:
    svc = svc or ServicioDatos()
    gestor = gestor or GestorTrabajos(svc)
    app = FastAPI(title="NEXUS API", version=VERSION, description=f"Contrato {CONTRATO}. Terminal de investigación XAUUSD.")
    app.state.svc, app.state.gestor = svc, gestor

    @app.exception_handler(DatosNoDisponibles)
    async def _sin_datos(_: Request, e: DatosNoDisponibles):
        return JSONResponse(status_code=503, content=dict(error="datos_no_disponibles", detalle=str(e)))

    @app.exception_handler(KeyError)
    async def _no_existe(_: Request, e: KeyError):
        return JSONResponse(status_code=404, content=dict(error="no_existe", detalle=f"No existe: {e.args[0] if e.args else ''}"))

    @app.exception_handler(ValueError)
    async def _invalido(_: Request, e: ValueError):
        return JSONResponse(status_code=422, content=dict(error="pedido_invalido", detalle=str(e)))

    def _tf(tf: int) -> int:
        if tf not in TEMPORALIDADES:
            raise ValueError(f"Temporalidad no soportada: {tf}. Opciones: {', '.join(map(str, TEMPORALIDADES))} minutos")
        return tf

    # ------------------------------------------------------------------ sistema y datos
    @app.get("/api/v1/salud", response_model=Salud)
    def salud():
        disp = {i["simbolo"]: i["disponible"] for i in svc.instrumentos()}
        modo = "sintético (solo pruebas, no es mercado real)" if svc.sintetico else "histórico (sin feed en vivo)"
        return dict(version=VERSION, datos=dict(instrumentos_disponibles=[k for k, v in disp.items() if v], modo=modo, sintetico=svc.sintetico),
                    pruebas="pytest -q tests", hora_servidor_ms=int(time.time() * 1000))

    @app.get("/api/v1/instrumentos", response_model=list[Instrumento])
    def instrumentos():
        return svc.instrumentos()

    @app.get("/api/v1/datos/{simbolo}/calidad", response_model=InformeCalidad)
    def calidad(simbolo: str):
        return svc.calidad(simbolo)

    @app.get("/api/v1/referencias", response_model=Referencias)
    def refs():
        """Definiciones que la interfaz muestra tal cual: sesiones, perfiles de costos, estados de órdenes y de trabajos."""
        return referencias.referencias()

    @app.get("/api/v1/mercado/horario", response_model=HorarioMercado)
    def horario(ahora_ms: int | None = None):
        """Si el mercado del oro está abierto ahora (por horario, sin feriados) y cuánto falta para el próximo cambio."""
        return SE.estado_mercado(ahora_ms if ahora_ms is not None else int(time.time() * 1000))

    @app.get("/api/v1/mercado/{simbolo}", response_model=FichaMercado)
    def ficha_mercado(simbolo: str):
        """Ficha de un instrumento para el Resumen: último dato histórico, cambio, tendencia y rango de 52 semanas."""
        return mercados.ficha(svc, simbolo)

    @app.get("/api/v1/resumen", response_model=Resumen)
    def resumen(simbolo: str = "XAUUSD"):
        """Datos para Overview: última vela disponible (histórica), estado de la candidata y actividad reciente."""
        primero, ultimo = svc.extremos(simbolo)
        d1, _ = svc.velas_hasta(simbolo, 1440, ultimo, 2)
        m1, _ = svc.velas_hasta(simbolo, 1, ultimo, 1)
        hip = catalogo.hipotesis()
        cuenta = {}
        for h in hip:
            cuenta[h["estado"]] = cuenta.get(h["estado"], 0) + 1
        return dict(contrato=CONTRATO, simbolo=simbolo, modo="sintético" if svc.sintetico else "histórico",
                    ultimo_minuto=dict(t=ultimo, iso=SE.iso(ultimo), ny=SE.texto_ny(ultimo), vela=m1[-1] if m1 else None),
                    primer_minuto=dict(t=primero, iso=SE.iso(primero)), sesion_del_ultimo_minuto=SE.sesion(ultimo),
                    ultimas_diarias=d1, candidata=E022.definicion(), pruebas_a_futuro=catalogo.pruebas_a_futuro(),
                    hipotesis_por_estado=cuenta, corridas_recientes=gestor.listar()[:5])

    # ------------------------------------------------------------------ replay
    @app.get("/api/v1/replay/inicio", response_model=Paso)
    def replay_inicio(simbolo: str = "XAUUSD"):
        """Límite inicial reproducible: 7 días antes del final de los datos (o el comienzo si hay menos)."""
        a, b = svc.extremos(simbolo)
        lim = svc.limite_para_fecha(simbolo, max(a, b - 7 * 86400000))
        return dict(limite_ms=lim, avanzo_minutos=0, al_final_de_los_datos=False)

    @app.get("/api/v1/replay/cuadro", response_model=CuadroReplay)
    def replay_cuadro(simbolo: str = "XAUUSD", tf: int = 15, limite_ms: int = Query(...), cantidad: int = 300):
        _tf(tf)
        velas, mas = svc.velas_hasta(simbolo, tf, limite_ms, cantidad)
        if not velas:
            raise ValueError("El límite es anterior al comienzo de los datos")
        j = svc.indice_limite(simbolo, limite_ms)
        t_lim = int(svc.m1(simbolo)["t"][j])
        _, ultimo = svc.extremos(simbolo)
        desde = velas[0]["t"]
        ses = [dict(v, hasta_ms=min(v["hasta_ms"], t_lim + 60000)) for v in SE.ventanas(desde, t_lim) if v["desde_ms"] <= t_lim]
        ev = E022.eventos(svc, simbolo, desde, t_lim)
        if SE.en_reapertura(t_lim):
            ev.append(dict(t=t_lim, tipo="aviso", titulo="Reapertura (18:00–18:15 NY)",
                           detalle="El bid de la reapertura está deprimido por el spread: precios poco operables (E041)."))
        ev.sort(key=lambda e: e["t"])
        return dict(simbolo=simbolo, temporalidad=tf,
                    limite=dict(limite_ms=t_lim, limite_iso=SE.iso(t_lim), limite_ny=SE.texto_ny(t_lim), sesion=SE.sesion(t_lim)),
                    velas=velas, sesiones=ses, eventos=ev, decision=E022.panel(svc, simbolo, t_lim) if simbolo == "XAUUSD" else None,
                    niveles=E022.niveles(svc, simbolo, t_lim),
                    indicadores=IND.calcular(svc, simbolo, tf, t_lim, cantidad), sesion_dia=IND.sesion_dia(svc, simbolo, t_lim),
                    hay_mas_atras=mas, al_final_de_los_datos=t_lim >= ultimo)

    @app.get("/api/v1/replay/paso", response_model=Paso)
    def replay_paso(simbolo: str = "XAUUSD", tf: int = 15, limite_ms: int = Query(...), n: int = 1, unidad: str = "velas"):
        _tf(tf)
        if unidad not in ("velas", "minutos"):
            raise ValueError("unidad: velas o minutos")
        if not (-5000 <= n <= 5000):
            raise ValueError("n fuera de rango (±5000)")
        lim, mins, fin = svc.siguiente_limite(simbolo, tf, limite_ms, n, unidad)
        return dict(limite_ms=lim, avanzo_minutos=mins, al_final_de_los_datos=fin)

    @app.get("/api/v1/replay/fecha", response_model=Paso)
    def replay_fecha(simbolo: str = "XAUUSD", fecha_ms: int | None = None, fecha_ny: str | None = None):
        """Salto de fecha: fecha_ms (UTC) o fecha_ny ('AAAA-MM-DDTHH:MM' en hora de Nueva York, convertida acá)."""
        if fecha_ny:
            try:
                d = SE.datetime.strptime(fecha_ny, "%Y-%m-%dT%H:%M").replace(tzinfo=SE.NY)
            except ValueError:
                raise ValueError("fecha_ny: formato AAAA-MM-DDTHH:MM") from None
            fecha_ms = int(d.timestamp() * 1000)
        if fecha_ms is None:
            raise ValueError("Falta fecha_ms o fecha_ny")
        lim = svc.limite_para_fecha(simbolo, fecha_ms)
        _, ultimo = svc.extremos(simbolo)
        return dict(limite_ms=lim, avanzo_minutos=0, al_final_de_los_datos=lim >= ultimo)

    @app.get("/api/v1/indicadores/catalogo", response_model=list[DefinicionIndicador])
    def catalogo_indicadores():
        """Biblioteca de indicadores del gráfico: clásicos y Smart Money Concepts [LuxAlgo] (licencia no comercial)."""
        return biblioteca.catalogo()

    @app.post("/api/v1/indicadores/calcular", response_model=RespuestaIndicadores)
    def calcular_indicadores(p: PedidoIndicadores):
        """Calcula los indicadores pedidos solo con velas hasta el límite; las series vienen alineadas con las velas visibles."""
        _tf(p.tf)
        if not (20 <= p.cantidad <= 1500):
            raise ValueError("cantidad fuera de rango (20 a 1500)")
        return biblioteca.calcular(svc, p.simbolo, p.tf, p.limite_ms, p.cantidad, [x.model_dump() for x in p.indicadores])

    @app.post("/api/v1/probador/correr", response_model=ResultadoProbador)
    def correr_probador(p: PedidoProbador, request: Request):
        """Prueba reglas armadas con indicadores clásicos: simulación minuto a minuto, costos, validación, azar y pruebas múltiples."""
        usuario = getattr(request.state, "usuario_id", None) or "local"
        return probador.correr(svc, p.model_dump(), usuario)

    @app.post("/api/v1/replay/cuenta", response_model=CuentaSimulada)
    def replay_cuenta(p: PedidoCuenta):
        """Cuenta simulada en el límite: equidad, margen (apalancamiento supuesto) y resultado de las órdenes con lotes."""
        ordenes = [o.model_dump() for o in p.ordenes]
        for o in ordenes:
            if o["tipo"] == "limite":
                simulacion.validar_limite(o)
        return simulacion.cuenta(svc, p.simbolo, p.limite_ms, p.capital, p.apalancamiento, ordenes)

    @app.post("/api/v1/replay/ordenes/estado", response_model=list[EstadoOrdenSimulada])
    def ordenes_estado(p: PedidoOrdenes):
        """Estado de órdenes simuladas en el límite dado (motor del laboratorio, solo minutos revelados)."""
        ordenes = [o.model_dump() for o in p.ordenes]
        for o in ordenes:
            if o["tipo"] == "limite":
                simulacion.validar_limite(o)
        return simulacion.estados(svc, p.simbolo, p.limite_ms, ordenes)

    # ------------------------------------------------------------------ investigación
    @app.get("/api/v1/estrategias", response_model=list[Estrategia])
    def estrategias():
        return catalogo.estrategias()

    @app.get("/api/v1/hipotesis", response_model=list[Hipotesis])
    def hipotesis():
        return catalogo.hipotesis()

    @app.get("/api/v1/investigacion/contexto", response_model=ContextoInvestigacion)
    def contexto():
        filas = catalogo.presupuesto_pruebas()
        total = next((str(f.get("configuraciones", "")) for f in filas if str(f.get("experimento", "")).upper() == "TOTAL"), None)
        return dict(presupuesto_pruebas=[f for f in filas if str(f.get("experimento", "")).upper() != "TOTAL"],
                    total_configuraciones=total, pruebas_a_futuro=catalogo.pruebas_a_futuro())

    @app.post("/api/v1/trabajos", response_model=Trabajo)
    def enviar(cfg: ConfigCorrida):
        return gestor.enviar(cfg.model_dump())

    @app.get("/api/v1/trabajos", response_model=list[Trabajo])
    def listar():
        return gestor.listar()

    @app.get("/api/v1/trabajos/{id}", response_model=Trabajo)
    def obtener(id: str):
        tr = gestor.obtener(id)
        if not tr:
            raise HTTPException(404, "No existe ese trabajo")
        return tr

    @app.post("/api/v1/trabajos/{id}/cancelar", response_model=Trabajo)
    def cancelar(id: str):
        tr = gestor.cancelar(id)
        if not tr:
            raise HTTPException(404, "No existe ese trabajo")
        return tr

    # ------------------------------------------------------------------ ejecución (simulada)
    @app.post("/api/v1/riesgo", response_model=CalculoRiesgo)
    def calcular_riesgo(p: PedidoRiesgo):
        return riesgo.calcular(p.simbolo, p.capital, p.riesgo_pct, p.entrada, p.stop, p.objetivo, p.paso_lote)

    # ------------------------------------------------------------------ interfaz
    if os.path.isdir(WEB):
        app.mount("/assets", StaticFiles(directory=os.path.join(WEB, "assets")), name="assets")

        @app.get("/{ruta:path}", include_in_schema=False)
        def spa(ruta: str):
            archivo = os.path.normpath(os.path.join(WEB, ruta))
            if ruta and archivo.startswith(WEB) and os.path.isfile(archivo):
                return FileResponse(archivo)
            return FileResponse(os.path.join(WEB, "index.html"))

    return app
