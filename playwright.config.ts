import { defineConfig, devices } from "@playwright/test";

/**
 * Configurazione Playwright On-Demand per Last Gestionale
 * - Eseguibile ESCLUSIVAMENTE su richiesta esplicita dell'utente
 * - Esegue test visivi headless (invisibili) senza impattare la CPU o l'ambiente di lavoro
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1, // 1 solo worker per non impegnare CPU e RAM
  timeout: 30000,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:1420",
    trace: "off",
    screenshot: "only-on-failure",
    video: "off",
    headless: true, // Completamente invisibile in background
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
