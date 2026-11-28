# NEXUS: interfaz (Vite) + API (FastAPI) + motor del laboratorio, en una sola imagen.
# Los datos (data/*.npz) NO van en la imagen: se montan como volumen (ver DEPLOY.md).
FROM node:22-slim AS web
WORKDIR /web
COPY nexus_web/package.json nexus_web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY nexus_web/ ./
RUN npx vite build

FROM python:3.13-slim
ARG NEXUS_COMMIT=
ENV NEXUS_COMMIT=${NEXUS_COMMIT} PYTHONUNBUFFERED=1 NUMBA_CACHE_DIR=/tmp/numba NEXUS_LOGIN=1 NEXUS_COOKIE_SEGURA=1
RUN useradd -m -u 1000 nexus
WORKDIR /app
COPY requirements-nexus.txt .
RUN pip install --no-cache-dir -r requirements-nexus.txt
COPY --chown=nexus lab/ lab/
COPY --chown=nexus nexus_api/ nexus_api/
COPY --chown=nexus docs/ docs/
COPY --chown=nexus NEXUS/ NEXUS/
COPY --chown=nexus registro/ registro/
COPY --chown=nexus resultados/ resultados/
COPY --chown=nexus pine/ pine/
COPY --chown=nexus README.md BITACORA.md ./
COPY --from=web --chown=nexus /web/dist nexus_web/dist
COPY --chown=nexus nexus_web/README.md nexus_web/README.md
RUN mkdir -p data registro/nexus && chown -R nexus /app/data /app/registro
USER nexus
EXPOSE 8800
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8800/api/v1/salud', timeout=4)"
CMD ["python", "-m", "nexus_api", "--host", "0.0.0.0", "--puerto", "8800"]
