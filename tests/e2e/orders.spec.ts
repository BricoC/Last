import { test, expect } from "@playwright/test";

test.describe("Order Manager E2E Visual & Functional Test (On-Demand)", () => {
  test("Verifica caricamento e stabilità tabella ordini", async ({ page }) => {
    // Naviga alla pagina locale
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Seleziona la tab Order Manager se non è già attiva
    const orderManagerTab = page.locator('text=Order Manager').first();
    if (await orderManagerTab.isVisible()) {
      await orderManagerTab.click();
    }

    // Attendi che la griglia AG Grid sia presente
    const grid = page.locator(".ag-theme-alpine");
    await expect(grid).toBeVisible({ timeout: 10000 });

    // Scatta uno screenshot di verifica
    await page.screenshot({ path: "tests/e2e/screenshots/order-manager-overview.png" });
  });
});
