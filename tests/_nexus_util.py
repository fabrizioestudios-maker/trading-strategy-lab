"""Datos sintéticos de 1 minuto para las pruebas de NEXUS (no requieren data/*.npz)."""
from nexus_api.sintetico import m1_sintetico  # noqa: F401  (se reexporta para las pruebas)


def truncar(m1, j):
    return {k: v[: j + 1] for k, v in m1.items()}
