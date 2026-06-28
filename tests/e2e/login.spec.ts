import { expect, test } from "@playwright/test";

test("login page is clean and does not expose secrets", async ({ page }) => {
  await page.goto("/login");

  await expect(page.getByText("Sign in to Command Centre")).toBeVisible();
  const bodyText = await page.locator("body").innerText();
  if (/Mock Mode/i.test(bodyText)) {
    await expect(page.getByTestId("login-mock-enter")).toBeVisible();
  } else {
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign In" })).toBeVisible();
  }
  await expect(page.getByText("Logout")).toHaveCount(0);
  await expect(page.getByText("Go to Login")).toHaveCount(0);

  const headings = await page.locator("h1,h2").evaluateAll((items) => items.map((item) => item.textContent ?? ""));
  expect(headings.filter((heading) => /^login$/i.test(heading.trim())).length).toBe(0);

  expect(bodyText).toMatch(/Supabase Mode|Mock Mode/i);
  expect(bodyText).not.toMatch(/SERVICE_ROLE|sk-[A-Za-z0-9_-]{20,}|EAAG[A-Za-z0-9]{20,}/);
});
