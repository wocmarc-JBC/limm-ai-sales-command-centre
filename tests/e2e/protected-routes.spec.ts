import { expect, test } from "@playwright/test";

const protectedRoutes = [
  "/",
  "/leads",
  "/appointments",
  "/appointment-settings",
  "/approvals",
  "/followups",
  "/quotation-readiness",
  "/client-files",
  "/reports",
  "/settings",
  "/audit-log"
];

for (const route of protectedRoutes) {
  test(`unauthenticated protected route blocks access: ${route}`, async ({ page }) => {
    await page.goto(route);
    await expect(page.locator("body")).toContainText("Login required");
    await expect(page.locator("body")).toContainText("Go to Login");
    await expect(page.getByText("Logout")).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText(/free consultation|quote range|rough estimate|price estimate/i);
  });
}

test("lead detail route blocks unauthenticated access", async ({ page }) => {
  await page.goto("/leads/lead-001");
  await expect(page.locator("body")).toContainText("Login required");
  await expect(page.locator("body")).toContainText("Go to Login");
  await expect(page.getByText("Logout")).toHaveCount(0);
});
