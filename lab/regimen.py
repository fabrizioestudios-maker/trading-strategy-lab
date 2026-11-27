"""
Detección de régimen con un HMM gaussiano (fase 4, E034), sin mirar adelante.

- ajustar(X): Baum–Welch (EM) con covarianzas diagonales, varios arranques; se usa SOLO con la muestra de desarrollo
  y después los parámetros quedan congelados.
- filtrar(X): probabilidades FILTRADAS P(estado_t | x_1..x_t) con el algoritmo forward. Cada día usa solo el pasado
  y el presente. (Las probabilidades suavizadas o Viterbi sobre toda la muestra usan el futuro: no se usan.)
  Las filas con NaN no aportan emisión ese día (solo la transición).
Los estados se ordenan por la media de la primera variable (estado 0 = la más baja, p. ej. volatilidad baja).
"""
import numpy as np
from scipy.special import logsumexp


class HMMGaussiano:
    def __init__(self, k=2, n_init=10, max_iter=300, tol=1e-7, semilla=0):
        self.k, self.n_init, self.max_iter, self.tol, self.semilla = k, n_init, max_iter, tol, semilla

    def _log_emision(self, X):
        n, d = X.shape
        out = np.zeros((n, self.k))
        ok = ~np.isnan(X).any(axis=1)
        Xo = X[ok]
        for j in range(self.k):
            v = self.var_[j]
            out[ok, j] = -0.5 * (np.sum(np.log(2 * np.pi * v)) + np.sum((Xo - self.mu_[j]) ** 2 / v, axis=1))
        return out

    def _forward_backward(self, logB):
        n = logB.shape[0]
        la = np.log(self.A_)
        alfa = np.zeros((n, self.k))
        alfa[0] = np.log(self.pi_) + logB[0]
        for t in range(1, n):
            alfa[t] = logsumexp(alfa[t - 1][:, None] + la, axis=0) + logB[t]
        ll = logsumexp(alfa[-1])
        beta = np.zeros((n, self.k))
        for t in range(n - 2, -1, -1):
            beta[t] = logsumexp(la + logB[t + 1][None, :] + beta[t + 1][None, :], axis=1)
        g = alfa + beta - ll
        xi = (alfa[:-1, :, None] + la[None] + logB[1:, None, :] + beta[1:, None, :]) - ll
        return ll, np.exp(g), np.exp(logsumexp(xi, axis=0))

    def ajustar(self, X):
        X = np.asarray(X, float)
        X = X[~np.isnan(X).any(axis=1)]
        n, d = X.shape
        rng = np.random.default_rng(self.semilla)
        var_g = X.var(axis=0)
        mejor = None
        for _ in range(self.n_init):
            orden = np.sort(rng.choice(n, self.k, replace=False))
            self.mu_ = X[orden].copy()
            self.var_ = np.tile(var_g, (self.k, 1))
            self.pi_ = np.full(self.k, 1.0 / self.k)
            self.A_ = np.full((self.k, self.k), 0.1 / max(self.k - 1, 1))
            np.fill_diagonal(self.A_, 0.9)
            prev = -np.inf
            for _it in range(self.max_iter):
                ll, g, xi = self._forward_backward(self._log_emision(X))
                self.pi_ = np.clip(g[0], 1e-6, None)
                self.pi_ /= self.pi_.sum()
                self.A_ = np.clip(xi / xi.sum(axis=1, keepdims=True), 1e-6, None)
                self.A_ /= self.A_.sum(axis=1, keepdims=True)
                w = g / g.sum(axis=0, keepdims=True)
                self.mu_ = w.T @ X
                self.var_ = np.maximum(np.stack([(w[:, j:j + 1] * (X - self.mu_[j]) ** 2).sum(axis=0) for j in range(self.k)]),
                                       1e-4 * var_g)
                if ll - prev < self.tol * abs(ll):
                    break
                prev = ll
            if mejor is None or ll > mejor[0]:
                mejor = (ll, self.mu_.copy(), self.var_.copy(), self.pi_.copy(), self.A_.copy())
        ll, self.mu_, self.var_, self.pi_, self.A_ = mejor
        orden = np.argsort(self.mu_[:, 0])
        self.mu_, self.var_, self.pi_ = self.mu_[orden], self.var_[orden], self.pi_[orden]
        self.A_ = self.A_[np.ix_(orden, orden)]
        self.loglik_ = ll
        self.n_ = n
        return self

    def bic(self):
        d = self.mu_.shape[1]
        p = self.k * d * 2 + self.k * (self.k - 1) + (self.k - 1)
        return -2 * self.loglik_ + p * np.log(self.n_)

    def filtrar(self, X):
        """Probabilidades filtradas (n × k), solo con el pasado."""
        X = np.asarray(X, float)
        logB = self._log_emision(X)
        la = np.log(self.A_)
        n = len(X)
        out = np.zeros((n, self.k))
        a = np.log(self.pi_) + logB[0]
        a -= logsumexp(a)
        out[0] = np.exp(a)
        for t in range(1, n):
            a = logsumexp(a[:, None] + la, axis=0) + logB[t]
            a -= logsumexp(a)
            out[t] = np.exp(a)
        return out
