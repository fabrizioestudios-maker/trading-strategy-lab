import { defineConfig, devices } from '@playwright/test';

// Pruebas de punta a punta contra la API en modo SINTÉTICO (no necesitan data/): la interfaz compilada la sirve la API.
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:8811', trace: 'off' },
  projects: [
    { name: 'escritorio', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
  ],
  webServer: {
    command: 'cd .. && python3 -m nexus_api --sintetico --puerto 8811',
    url: 'http://127.0.0.1:8811/api/v1/salud',
    timeout: 120_000,
    reuseExistingServer: false,
  },
});
