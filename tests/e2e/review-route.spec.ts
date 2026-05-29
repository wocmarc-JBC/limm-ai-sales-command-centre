import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

const reviewRouteEnabled = process.env.NEXT_PUBLIC_ENABLE_REVIEW_ROUTE === "true";

test("review route is disabled by default unless explicitly enabled", async ({ page }) => {
  await page.goto("/review-chatgpt-ui");

  if (!reviewRouteEnabled) {
    await expect(page.locator("body")).not.toContainText("Mock UI Review Mode");
    await expect(page.getByText("Logout")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Approve|Reject|Snooze|Send|Book|Save/i })).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText(/No Live Actions|Demo Data Only|Commercial clinic/i);

    fs.mkdirSync(path.join(process.cwd(), "screenshots"), { recursive: true });
    await page.screenshot({ path: "screenshots/review-route-disabled.png", fullPage: true });
    return;
  }

  await expect(page.locator("body")).toContainText("Mock UI Review Mode");
  await expect(page.locator("body")).toContainText("No Login Required");
  await expect(page.locator("body")).toContainText("No Live Actions");
  await expect(page.locator("body")).toContainText("Demo Data Only");
  await expect(page.getByText("Login required", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Logout")).toHaveCount(0);
  await expect(page.locator("body")).toContainText("Client Files Preview");
  await expect(page.locator("body")).toContainText("Commercial clinic");
  await expect(page.locator("body")).toContainText("LIMM Works");
  await expect(page.locator("body")).toContainText("2026-05-31");

  const bodyText = await page.locator("body").innerText();
  expect(bodyText).not.toMatch(/free consultation/i);
  expect(bodyText).not.toMatch(/\bS\$\s*\d{2,}|\bSGD\s*\d{2,}|\bquote range\b|\brough estimate\b|\bprice estimate\b/i);
  expect(new Date("2026-05-31T00:00:00").getDay()).toBe(0);

  const buttons = await page.locator("button").evaluateAll((items) =>
    items.map((button) => ({ disabled: button.hasAttribute("disabled"), text: button.textContent ?? "" }))
  );
  expect(buttons.length).toBeGreaterThan(0);
  expect(buttons.every((button) => button.disabled || /Preview Only/i.test(button.text))).toBeTruthy();

  const links = await page.locator("nav a").evaluateAll((items) => items.map((item) => item.getAttribute("href") ?? ""));
  expect(links.every((href) => href.startsWith("#"))).toBeTruthy();

  fs.mkdirSync(path.join(process.cwd(), "screenshots"), { recursive: true });
  await page.screenshot({ path: "screenshots/review-route.png", fullPage: true });
});
