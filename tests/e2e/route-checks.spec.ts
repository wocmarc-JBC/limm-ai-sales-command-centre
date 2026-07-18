import { expect, test } from "@playwright/test";

const reviewRouteEnabled = process.env.NEXT_PUBLIC_ENABLE_REVIEW_ROUTE === "true";
const qaE2EMode = process.env.QA_E2E_MODE === "true" || process.env.QA_E2E_MODE === "1";

const isBenignRouteConsoleError = (text: string) =>
  /favicon/i.test(text) ||
  /Failed to fetch RSC payload/i.test(text) ||
  /Fast Refresh had to perform a full reload/i.test(text);

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

    const response = await page.goto(route.path, { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBeLessThan(500);
    if (qaE2EMode && route.path !== "/login") {
      await expect(page.locator("body")).not.toContainText("Login required");
      await expect(page.locator("body")).not.toContainText(/Application error|Unhandled Runtime Error/i);
    } else {
      await expect(page.locator("body")).toContainText(route.expected);
    }
    await expect(page.locator("body")).not.toContainText(/free consultation|quote range|rough estimate|price estimate/i);
    expect(errors.filter((error) => !isBenignRouteConsoleError(error))).toEqual([]);
  });
}

test("route coverage: /review-chatgpt-ui production lockdown", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));

  const response = await page.goto("/review-chatgpt-ui", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBeLessThan(500);
  await expect(page.locator("body")).not.toContainText(/free consultation|quote range|rough estimate|price estimate/i);

  if (reviewRouteEnabled) {
    await expect(page.locator("body")).toContainText("Mock UI Review Mode");
    await expect(page.locator("body")).toContainText("No Live Actions");
  } else {
    await expect(page.locator("body")).not.toContainText("Mock UI Review Mode");
    await expect(page.locator("body")).not.toContainText("No Live Actions");
    if (!qaE2EMode) await expect(page.getByText("Logout")).toHaveCount(0);
  }

  const expectedDisabledRouteNoise = !reviewRouteEnabled && /server responded with a status of 404/i;
  expect(
    errors.filter((error) => !isBenignRouteConsoleError(error) && !(expectedDisabledRouteNoise && expectedDisabledRouteNoise.test(error)))
  ).toEqual([]);
});
