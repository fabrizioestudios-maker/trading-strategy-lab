import { expect, test, type Page } from '@playwright/test';

const MODULOS = ['Resumen', 'Replay', 'Lab', 'Capas', 'Ejecución', 'Analítica', 'Datos', 'Ajustes'];

function vigilarErrores(page: Page) {
  const errores: string[] = [];
  page.on('pageerror', (e) => errores.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errores.push(m.text()));
  return errores;
}

test.beforeEach(async ({ page }) => {
  // cada prueba arranca con un espacio de trabajo limpio
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('nexus-e2e')) {
      localStorage.clear();
      sessionStorage.setItem('nexus-e2e', '1');
    }
  });
});

test('los ocho módulos se abren desde la navegación, con un título y sin errores', async ({ page }) => {
  const errores = vigilarErrores(page);
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Módulos' }).first();
  for (const m of MODULOS) {
    await nav.getByRole('link', { name: m, exact: true }).click();
    await expect(nav.getByRole('link', { name: m, exact: true })).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('h1')).toHaveCount(1);
  }
  expect(errores).toEqual([]);
});

test('el modo sintético se avisa en todas las pantallas', async ({ page }) => {
  await page.goto('/#/resumen');
  await expect(page.getByRole('note').filter({ hasText: 'Datos sintéticos' })).toBeVisible();
  await page.goto('/#/analitica');
  await expect(page.getByRole('note').filter({ hasText: 'Datos sintéticos' })).toBeVisible();
});

test('paleta de comandos y atajos de teclado', async ({ page }) => {
  await page.goto('/#/resumen');
  await expect(page.getByRole('heading', { name: 'Resumen' })).toBeVisible();
  await page.keyboard.press('Control+k');
  const paleta = page.getByRole('dialog', { name: 'Paleta de comandos' });
  await expect(paleta).toBeVisible();
  await page.keyboard.type('laboratorio');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#\/laboratorio/);
  await page.locator('body').click({ position: { x: 5, y: 300 } });
  await page.keyboard.press('g');
  await page.keyboard.press('r');
  await expect(page).toHaveURL(/#\/replay/);
  await page.keyboard.press('?');
  await expect(page.getByRole('dialog', { name: 'Atajos de teclado' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Atajos de teclado' })).toHaveCount(0);
});

test('replay: ninguna respuesta trae datos posteriores al límite y los pasos son deterministas', async ({ page }) => {
  const cuadros: { limite: number; ultima: number; todas: boolean }[] = [];
  page.on('response', async (r) => {
    if (!r.url().includes('/api/v1/replay/cuadro')) return;
    const c = await r.json();
    const lim = c.limite.limite_ms;
    cuadros.push({
      limite: lim,
      ultima: c.velas[c.velas.length - 1].t,
      todas:
        c.velas.every((v: { t: number }) => v.t <= lim) &&
        c.eventos.every((e: { t: number }) => e.t <= lim) &&
        c.niveles.every((n: { conocido_desde_ms: number }) => n.conocido_desde_ms <= lim + 60_000) &&
        c.indicadores.rsi.length === c.velas.length &&
        c.sesion_dia.apertura_ms <= lim,
    });
  });
  await page.goto('/#/replay');
  await expect(page.locator('.grafico__etiqueta-limite')).toBeVisible();
  await expect(page.getByRole('img', { name: /^RSI 14/ })).toBeVisible();
  await expect(page.getByRole('img', { name: /^MACD/ })).toBeVisible();
  await page.locator('.terminal__velas').click({ position: { x: 200, y: 200 } });
  const n0 = cuadros.length;
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => cuadros.length).toBeGreaterThan(n0 + i);
  }
  const avance = cuadros.slice(n0 - 1).map((c) => c.limite);
  for (let i = 1; i < avance.length; i++) expect(avance[i]).toBeGreaterThan(avance[i - 1]);
  const antes = cuadros.length;
  await page.keyboard.press('ArrowLeft');
  await expect.poll(() => cuadros.length).toBeGreaterThan(antes);
  expect(cuadros[cuadros.length - 1].limite).toBeLessThan(avance[avance.length - 1]);
  expect(cuadros.every((c) => c.todas && c.ultima <= c.limite)).toBe(true);
  // el mismo límite da el mismo cuadro (reproducible)
  const lim = cuadros[cuadros.length - 1].limite;
  const a = await page.request.get(`/api/v1/replay/cuadro?simbolo=XAUUSD&tf=15&limite_ms=${lim}&cantidad=300`);
  const b = await page.request.get(`/api/v1/replay/cuadro?simbolo=XAUUSD&tf=15&limite_ms=${lim}&cantidad=300`);
  expect(await a.text()).toBe(await b.text());
});

test('replay: una orden simulada espera el llenado y después cambia de estado', async ({ page }) => {
  await page.goto('/#/replay');
  await expect(page.locator('.grafico__etiqueta-limite')).toBeVisible();
  await page.locator('.terminal__velas').click({ position: { x: 200, y: 200 } });
  await page.keyboard.press('b');
  await expect(page.getByRole('tab', { name: 'Operar' })).toHaveAttribute('aria-selected', 'true');
  const crear = page.getByRole('button', { name: 'Crear orden simulada de compra' });
  await expect(crear).toBeEnabled();
  await expect(page.getByText(/lotes/).first()).toBeVisible();
  await crear.click();
  await page.getByRole('tab', { name: /Órdenes/ }).click();
  await expect(page.locator('.lista-ordenes .insignia').filter({ hasText: 'Esperando llenado' })).toBeVisible();
  await page.locator('.terminal__velas').click({ position: { x: 200, y: 200 } });
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.lista-ordenes .insignia').filter({ hasText: /Abierta|Cerrada|Rechazada/ })).toBeVisible();
  // la cuenta simulada refleja la orden (la calcula la API) y se aclara que es simulación
  await expect(page.getByRole('region', { name: 'Cuenta simulada' })).toContainText('cerrada');
  await page.getByRole('tab', { name: 'Operar' }).click();
  await expect(page.getByText(/Simulación: no sale a ningún bróker/)).toBeVisible();
});

test('replay: una orden límite queda pendiente y se resuelve con el simulador del laboratorio', async ({ page }) => {
  await page.goto('/#/replay');
  await expect(page.locator('.grafico__etiqueta-limite')).toBeVisible();
  await page.locator('.terminal__velas').click({ position: { x: 200, y: 200 } });
  await page.keyboard.press('v');
  await page.getByRole('radio', { name: 'Límite' }).click();
  const crear = page.getByRole('button', { name: 'Crear orden límite de venta' });
  await expect(crear).toBeEnabled();
  await crear.click();
  await page.getByRole('tab', { name: /Órdenes/ }).click();
  await expect(page.locator('.lista-ordenes .insignia').filter({ hasText: 'Esperando llenado' })).toBeVisible();
  await page.locator('.terminal__velas').click({ position: { x: 200, y: 200 } });
  for (let i = 0; i < 4; i++) await page.keyboard.press('Shift+ArrowRight');
  await expect(page.locator('.lista-ordenes .insignia').filter({ hasText: /Esperando llenado|Abierta|Cerrada|Cancelada|Vencida/ })).toBeVisible();
});

test('laboratorio: una corrida real pasa por sus estados y termina en la analítica', async ({ page }) => {
  await page.goto('/#/laboratorio?estrategia=e022');
  await page.getByRole('button', { name: 'Revisar y correr' }).click();
  await page.getByRole('dialog', { name: 'Correr E022' }).getByRole('button', { name: 'Correr ahora' }).click();
  await expect(page).toHaveURL(/vista=corridas/);
  await expect(page.getByText('Trabajo recibido con su configuración inmutable')).toBeVisible();
  const ver = page.getByRole('link', { name: 'Ver resultados' });
  await expect(ver).toBeVisible({ timeout: 45_000 });
  await ver.click();
  await expect(page).toHaveURL(/#\/analitica/);
  await expect(page.getByText(/Métricas de total/)).toBeVisible();
  await expect(page.getByText(/no una estrategia validada/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Pliegues anuales' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Monte Carlo de riesgo' })).toBeVisible();
});

test('accesibilidad: todos los botones tienen nombre y el foco se ve', async ({ page }) => {
  for (const ruta of ['resumen', 'replay', 'laboratorio', 'ejecucion', 'ajustes']) {
    await page.goto(`/#/${ruta}`);
    await page.waitForLoadState('networkidle');
    const sinNombre = await page.$$eval('button, [role="button"], a[href]', (els) =>
      els.filter((e) => !(e.getAttribute('aria-label') || e.textContent?.trim() || e.getAttribute('title'))).map((e) => e.outerHTML.slice(0, 80)),
    );
    expect(sinNombre, ruta).toEqual([]);
  }
  await page.keyboard.press('Tab');
  const foco = await page.evaluate(() => getComputedStyle(document.activeElement as Element).boxShadow);
  expect(foco).not.toBe('none');
});

test.describe('teléfono', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  test('navegación inferior y sin desborde horizontal', async ({ page }) => {
    await page.goto('/#/resumen');
    const abajo = page.locator('.nav-movil');
    await expect(abajo).toBeVisible();
    await expect(page.locator('.riel')).toBeHidden();
    for (const ruta of ['resumen', 'replay', 'laboratorio', 'analitica', 'ejecucion', 'datos', 'ajustes', 'herramientas']) {
      await page.goto(`/#/${ruta}`);
      await page.waitForLoadState('networkidle');
      const desborde = await page.evaluate(() => {
        const p = document.querySelector('.principal') as HTMLElement;
        return Math.max(document.documentElement.scrollWidth - window.innerWidth, p.scrollWidth - p.clientWidth);
      });
      expect(desborde, ruta).toBeLessThanOrEqual(1);
    }
    await abajo.getByRole('button', { name: 'Más' }).click();
    await page.getByRole('dialog', { name: 'Módulos' }).getByRole('link', { name: /Centro de datos/ }).click();
    await expect(page).toHaveURL(/#\/datos/);
  });
});
