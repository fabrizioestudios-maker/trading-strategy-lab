# NEXUS: funciones frente a una plataforma de gráficos profesional

Estado al 28/11/2026. «Hecho» quiere decir con pruebas automáticas y verificado en el navegador.

## Gráficos

| Función | Estado | Nota |
| --- | --- | --- |
| Velas, Heikin Ashi, barras, línea, área | Hecho | Selector en la barra del gráfico |
| Escala logarítmica | Hecho | Botón «log» |
| Temporalidades 1m, 5m, 15m, 1H, 4H, 1D | Hecho | |
| Biblioteca de indicadores con buscador, ajustes, ocultar y quitar | Hecho | Tecla `/`; hasta 12 por gráfico |
| 15 indicadores clásicos | Hecho | SMA, EMA, WMA, Bollinger, Donchian, Keltner, SAR, RSI, MACD, estocástico, CCI, %R, ROC, ATR, ADX |
| Smart Money Concepts [LuxAlgo] | Hecho | BOS/CHoCH interno y swing, order blocks, EQH/EQL, FVG, máximos/mínimos fuertes y débiles, premium/discount. Licencia no comercial |
| Herramientas de dibujo | Hecho | Tendencia, rayo, horizontal, rectángulo, Fibonacci; seleccionar y borrar |
| Lista de seguimiento | Hecho | Pestaña «Lista» del gráfico |
| Replay de mercado sin datos futuros | Hecho | Con rango desde/hasta |
| Varios gráficos en la misma pantalla | Falta | |
| Alertas de precio y de indicador | Falta | Requiere avisos por correo o push |
| Más indicadores (Ichimoku, VWAP, perfil de volumen) | Falta | VWAP y volumen necesitan datos de volumen que hoy no hay |
| Datos en vivo | Falta | Requiere un proveedor de datos pago |

## Trading y estrategias

| Función | Estado | Nota |
| --- | --- | --- |
| Órdenes simuladas (mercado y límite) y cuenta simulada | Hecho | En el replay |
| Probador de estrategias con reglas | Hecho | Indicadores clásicos, stop por ATR, objetivo por RR, costos reales |
| Validación cuantitativa | Hecho | Muestra de validación reservada, bootstrap, azar, Deflated Sharpe con tus pruebas, Monte Carlo, sensibilidad a costos |
| Laboratorio con estrategias registradas (E022) | Hecho | Corridas reproducibles con su procedencia |
| Optimización de parámetros con control de sobreajuste | Falta | Walk-forward y PBO ya existen en el laboratorio; falta llevarlos al probador |
| Editor de código de estrategias | Falta | Hoy las reglas se arman con formularios |
| Conexión a un bróker | No previsto | NEXUS no envía órdenes reales |

## Cuentas y administración

| Función | Estado | Nota |
| --- | --- | --- |
| Registro e ingreso con correo y contraseña | Hecho | scrypt, sesiones seguras, límites de intentos |
| Ingreso con Google | Hecho | Falta poner el Client ID al desplegar (DEPLOY.md) |
| Panel de administración | Hecho | Resumen del proyecto, usuarios, actividad, documentos, sistema, licencias |
| Recuperar contraseña por correo | Falta | Requiere un servicio de correo (SMTP) |
| Planes y pagos | No previsto | Si se cobra, revisar la licencia de LuxAlgo |
| Guardar gráficos y estrategias en la cuenta (no solo en el navegador) | Falta | Hoy se guardan en el navegador |

## Comunidad, noticias y mercado

| Función | Estado | Nota |
| --- | --- | --- |
| Ideas y publicaciones de usuarios | Falta | |
| Noticias y calendario económico | Falta | Requiere un proveedor de datos |
| Screener de mercados | Falta | Con 9 instrumentos, la lista de seguimiento cubre lo básico |
