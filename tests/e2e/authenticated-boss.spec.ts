import { expect, test } from "@playwright/test";

const email = process.env.SUPABASE_TEST_EMAIL;
const password = process.env.SUPABASE_TEST_PASSWORD;

test.describe("authenticated boss flow", () => {
  test.skip(!email || !password, "SUPABASE_TEST_EMAIL and SUPABASE_TEST_PASSWORD are required for authenticated boss browser tests.");

  test("boss can login, inspect core pages, and logout", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(email!);
    await page.getByLabel("Password").fill(password!);
    await page.getByRole("button", { name: "Sign In" }).click();

    await expect(page.getByText("Logout")).toBeVisible();
    await expect(page.locator("body")).toContainText(/boss|admin|sales|viewer/i);

    for (const route of ["/", "/settings", "/appointment-settings", "/leads", "/leads/lead-001", "/approvals", "/followups", "/quotation-readiness", "/audit-log"]) {
      await page.goto(route);
      await expect(page.getByText("Login required")).toHaveCount(0);
      await expect(page.locator("body")).not.toContainText(/free consultation|quote range|rough estimate|price estimate/i);
    }

    await page.getByText("Logout").click();
    await page.goto("/");
    await expect(page.locator("body")).toContainText("Login required");
  });
});
