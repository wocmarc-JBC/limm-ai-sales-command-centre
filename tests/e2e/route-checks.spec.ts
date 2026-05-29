import { expect, test } from "@playwright/test";

const reviewRouteEnabled = process.env.NEXT_PUBLIC_ENABLE_REVIEW_ROUTE === "true";

const routes = [
  { path: "/", expected: "Login required" },
  { path: "/login", expected: "Sign in to Command Centre" },
  { path: "/leads", expected: "Login required" },
  { path: "/leads/lead-001", expected: "Login required" },
  { path: "/appointments", expected: "Login required" },
  { path: "/appointment-settings", expected: "Login required" },
  { path: "/approvals", expected: "Login required" },
  { path: "/followups", expected: "Login required" },
  { path: "/quotation-readiness", expected: "Login required" },
  { path: "/client-files", expected: "Login required" },
  { path: "/reports", expected: "Login required" },
  { path: "/settings", expected: "Login required" },
  { path: "/audit-log", expected: "Login required" }
];

for (const route of routes) {
  test(`route coverage: ${route.path}`, async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(error.message));

    const response = await page.goto(route.path);
    expect(response?.status()).toBeLessThan(500);
    await expect(page.locator("body")).toContainText(route.expected);
    await expect(page.locator("body")).not.toContainText(/free consultation|quote range|rough estimate|price estimate/i);
    expect(errors.filter((error) => !/favicon/i.test(error))).toEqual([]);
  });
}

test("route coverage: /review-chatgpt-ui production lockdown", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));

  const response = await page.goto("/review-chatgpt-ui");
  expect(response?.status()).toBeLessThan(500);
  await expect(page.locator("body")).not.toContainText(/free consultation|quote range|rough estimate|price estimate/i);

  if (reviewRouteEnabled) {
    await expect(page.locator("body")).toContainText("Mock UI Review Mode");
    await expect(page.locator("body")).toContainText("No Live Actions");
  } else {
    await expect(page.locator("body")).not.toContainText("Mock UI Review Mode");
    await expect(page.locator("body")).not.toContainText("No Live Actions");
    await expect(page.getByText("Logout")).toHaveCount(0);
  }

  expect(errors.filter((error) => !/favicon/i.test(error))).toEqual([]);
});
