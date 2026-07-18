import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

const runId = process.env.V4_2_QA_RUN_ID ?? `v4_2_browser_human_test_${new Date().toISOString().replace(/[:.]/g, "-")}`;
const screenshotDir = process.env.V4_2_SCREENSHOT_DIR ?? path.join(process.cwd(), "screenshots", runId);
const summaryDir = process.env.V4_2_QA_SUMMARY_DIR ?? path.join(process.cwd(), "test-results", "v4_2_qa_summary");
const marker = runId;
const authEmail = process.env.SUPABASE_TEST_EMAIL;
const authPassword = process.env.SUPABASE_TEST_PASSWORD;
const reviewRouteEnabled = process.env.NEXT_PUBLIC_ENABLE_REVIEW_ROUTE === "true";
const qaE2EMode = process.env.QA_E2E_MODE === "true" || process.env.QA_E2E_MODE === "1";

const unsafeCopyPattern = /free consultation|quote range|price range|rough estimate|estimated price|price estimate|package price/i;
const strictAmountPattern = /\bS\$\s*\d{2,}|\bSGD\s*\d{2,}|\$\s*\d{2,}/i;

const routes = [
  { path: "/", heading: "Marcus Command Centre Dashboard", protected: true },
  { path: "/login", heading: "Sign in to Command Centre", protected: false },
  { path: "/leads", heading: "AI Lead Inbox", protected: true },
  { path: "/leads/lead-001", heading: "Lead Detail", protected: true },
  { path: "/appointments", heading: "Appointment Command Centre", protected: true },
  { path: "/appointment-settings", heading: "Appointment Settings", protected: true },
  { path: "/approvals", heading: "Boss Approval Queue", protected: true },
  { path: "/followups", heading: "Follow-Up Queue", protected: true },
  { path: "/quotation-readiness", heading: "Quotation Readiness", protected: true },
  { path: "/client-files", heading: "Client Files", protected: true },
  { path: "/reports", heading: "Reports", protected: true },
  { path: "/settings", heading: "Settings", protected: true },
  { path: "/audit-log", heading: "Audit Log", protected: true },
  { path: "/review-chatgpt-ui", heading: "Mock UI Review Mode", protected: false }
];

const responsiveRoutes = new Set(["/", "/leads", "/appointment-settings", "/approvals", "/review-chatgpt-ui"]);
// Desktop, tablet, and mobile coverage is supplied by playwright.config.ts projects.

type Summary = {
  project: string;
  route?: string;
  test: string;
  status: "PASS" | "FAIL" | "MANUAL REQUIRED";
  expected?: string;
  consoleErrors?: string[];
  visibleErrors?: string[];
  screenshot?: string;
  buttons?: string[];
  forms?: string[];
  notes?: string[];
};

function ensureDirs() {
  fs.mkdirSync(screenshotDir, { recursive: true });
  fs.mkdirSync(summaryDir, { recursive: true });
}

function slug(value: string) {
  return value.replace(/^\/$/, "dashboard").replace(/^\//, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "root";
}

function record(summary: Summary) {
  ensureDirs();
  fs.appendFileSync(path.join(summaryDir, `${summary.project}.jsonl`), `${JSON.stringify(summary)}\n`, "utf8");
}

async function bodyText(page: Page) {
  return page.locator("body").innerText({ timeout: 10_000 });
}

async function visibleButtonTexts(page: Page) {
  return page.locator("button, a[role='button'], input[type='submit']").evaluateAll((items) =>
    items
      .filter((item) => {
        const rect = item.getBoundingClientRect();
        const style = window.getComputedStyle(item);
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
      })
      .map((item) => (item.textContent ?? item.getAttribute("value") ?? item.getAttribute("aria-label") ?? "").trim())
      .filter(Boolean)
  );
}

async function visibleFormNames(page: Page) {
  return page.locator("form").evaluateAll((forms) =>
    forms.map((form, index) => {
      const labels = Array.from(form.querySelectorAll("label, button, input, select"))
        .map((item) => (item.textContent ?? item.getAttribute("name") ?? item.getAttribute("aria-label") ?? "").trim())
        .filter(Boolean)
        .slice(0, 4)
        .join(" | ");
      return labels || `form-${index + 1}`;
    })
  );
}

async function visibleErrorLines(page: Page) {
  const text = await bodyText(page);
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /\b(error|failed|exception|crash|not found|permission denied)\b/i.test(line))
    .slice(0, 10);
}

async function assertNoHorizontalScroll(page: Page) {
  const layout = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth
  }));
  expect(layout.scrollWidth, `Horizontal scroll detected: ${layout.scrollWidth} > ${layout.clientWidth}`).toBeLessThanOrEqual(layout.clientWidth + 4);
}

async function screenshot(page: Page, projectName: string, name: string) {
  ensureDirs();
  const file = path.join(screenshotDir, `${projectName}-${name}.png`);
  // Keep route evidence deterministic. Long responsive pages can produce very large
  // bitmaps and make Chromium wait on off-screen font/layout work indefinitely.
  await page.screenshot({ path: file, fullPage: false });
  return path.relative(process.cwd(), file);
}

test.describe("v4.2 full route-by-route human browser QA", () => {
  for (const route of routes) {
    test(`route human check: ${route.path}`, async ({ page }, testInfo) => {
      const projectName = testInfo.project.name;
      const consoleErrors: string[] = [];
      page.on("console", (message) => {
        if (message.type() === "error" && !/favicon/i.test(message.text())) consoleErrors.push(message.text());
      });
      page.on("pageerror", (error) => consoleErrors.push(error.message));

      const notes: string[] = [];
      const expected = route.protected ? `${route.heading} or protected Login required block` : route.heading;
      let shot = "";
      try {
        const response = await page.goto(route.path, { waitUntil: "domcontentloaded" });
        await page.waitForLoadState("load", { timeout: 5_000 }).catch(() => {
          notes.push("Load-state timeout reached; DOM content loaded and route checks continued.");
        });
        expect(response?.status() ?? 200).toBeLessThan(500);

        const text = await bodyText(page);
        if (route.path === "/review-chatgpt-ui" && !reviewRouteEnabled) {
          await expect(page.locator("body")).not.toContainText("Mock UI Review Mode");
          if (!qaE2EMode) await expect(page.getByText("Logout")).toHaveCount(0);
          notes.push("Review route disabled by default unless NEXT_PUBLIC_ENABLE_REVIEW_ROUTE=true.");
        } else if (route.protected && /Login required/i.test(text)) {
          await expect(page.locator("body")).toContainText("Login required");
          await expect(page.getByText("Logout")).toHaveCount(0);
        } else if (qaE2EMode && route.protected) {
          expect(text.length).toBeGreaterThan(80);
          expect(text).not.toMatch(/Application error|Unhandled Runtime Error|NEXT_NOT_FOUND/i);
          notes.push("QA_E2E_MODE mock auth loaded protected route without production data mutation.");
        } else {
          await expect(page.locator("body")).toContainText(route.heading);
        }

        expect(text).not.toMatch(unsafeCopyPattern);
        if (route.path === "/review-chatgpt-ui" || route.path === "/quotation-readiness") {
          expect(text).not.toMatch(strictAmountPattern);
        }
        if (responsiveRoutes.has(route.path)) {
          await assertNoHorizontalScroll(page);
        }

        const buttons = await visibleButtonTexts(page);
        const forms = await visibleFormNames(page);
        const errors = await visibleErrorLines(page);
        shot = await screenshot(page, projectName, `route-${slug(route.path)}`);

        record({
          project: projectName,
          route: route.path,
          test: "route human check",
          status: "PASS",
          expected,
          consoleErrors,
          visibleErrors: errors,
          screenshot: shot,
          buttons,
          forms,
          notes
        });

        // Console errors are recorded in the v4.2 report instead of stopping route coverage early.
      } catch (error) {
        shot = shot || await screenshot(page, projectName, `failed-route-${slug(route.path)}`).catch(() => "");
        record({
          project: projectName,
          route: route.path,
          test: "route human check",
          status: "FAIL",
          expected,
          consoleErrors,
          visibleErrors: await visibleErrorLines(page).catch(() => []),
          screenshot: shot,
          notes: [...notes, error instanceof Error ? error.message : String(error)]
        });
        throw error;
      }
    });
  }
});

test.describe("v4.2 review route detailed human QA", () => {
  test("review route is public, mock-only, safe, and preview-only", async ({ page }, testInfo) => {
    const consoleErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error" && !/favicon/i.test(message.text())) consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => consoleErrors.push(error.message));

    await page.goto("/review-chatgpt-ui", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("load", { timeout: 5_000 }).catch(() => undefined);

    if (!reviewRouteEnabled) {
      const text = await bodyText(page);
      expect(text).not.toMatch(unsafeCopyPattern);
      expect(text).not.toMatch(strictAmountPattern);
      await expect(page.locator("body")).not.toContainText("Mock UI Review Mode");
      if (!qaE2EMode) await expect(page.getByText("Logout")).toHaveCount(0);
      const shot = await screenshot(page, testInfo.project.name, "review-route-disabled");
      record({
        project: testInfo.project.name,
        route: "/review-chatgpt-ui",
        test: "review route disabled by default",
        status: "PASS",
        consoleErrors,
        visibleErrors: await visibleErrorLines(page),
        screenshot: shot,
        notes: ["Review route is disabled unless NEXT_PUBLIC_ENABLE_REVIEW_ROUTE=true."]
      });
      return;
    }

    for (const text of ["Mock UI Review Mode", "No Login Required", "No Live Actions", "Demo Data Only", "Client Files Preview", "Commercial clinic", "LIMM Works", "2026-05-31"]) {
      await expect(page.locator("body")).toContainText(text);
    }
    expect(new Date("2026-05-31T00:00:00").getDay()).toBe(0);

    const text = await bodyText(page);
    expect(text).not.toMatch(unsafeCopyPattern);
    expect(text).not.toMatch(strictAmountPattern);
    await expect(page.getByText("Login required", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Logout")).toHaveCount(0);

    const navLinks = page.locator("nav a[href^='#']");
    const navCount = await navLinks.count();
    for (let index = 0; index < navCount; index += 1) {
      await navLinks.nth(index).click();
      await expect(page).toHaveURL(/review-chatgpt-ui(#.+)?$/);
    }

    const buttons = await page.locator("button").evaluateAll((items) =>
      items.map((button) => ({
        disabled: button.hasAttribute("disabled"),
        text: (button.textContent ?? "").trim()
      }))
    );
    expect(buttons.length).toBeGreaterThan(0);
    expect(buttons.every((button) => button.disabled || /Preview Only/i.test(button.text))).toBeTruthy();

    const beforeText = await bodyText(page);
    const shot = await screenshot(page, testInfo.project.name, "review-route-detailed");
    const afterText = await bodyText(page);
    expect(afterText).toBe(beforeText);

    record({
      project: testInfo.project.name,
      route: "/review-chatgpt-ui",
      test: "review route detailed",
      status: "PASS",
      consoleErrors,
      visibleErrors: await visibleErrorLines(page),
      screenshot: shot,
      buttons: buttons.map((button) => `${button.text}${button.disabled ? " [disabled]" : ""}`),
      notes: [`Clicked ${navCount} internal review nav links. Verified ${buttons.length} preview buttons disabled or Preview Only.`]
    });
    // Console errors are recorded in the v4.2 report instead of stopping review coverage early.
  });
});

test.describe("v4.2 login and auth human QA", () => {
  test("login page fields, invalid sign-in handling, and no protected-shell confusion", async ({ page }, testInfo) => {
    const consoleErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error" && !/favicon/i.test(message.text())) consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => consoleErrors.push(error.message));

    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("Sign in to Command Centre")).toBeVisible();
    const loginText = await bodyText(page);
    if (/Mock Mode/i.test(loginText)) {
      await expect(page.getByTestId("login-mock-enter")).toBeVisible();
    } else {
      await expect(page.getByLabel("Email")).toBeVisible();
      await expect(page.getByLabel("Password")).toBeVisible();
      await expect(page.getByRole("button", { name: "Sign In" })).toBeVisible();
    }
    await expect(page.getByText("Logout")).toHaveCount(0);
    await expect(page.getByText("Go to Login")).toHaveCount(0);

    const headingTexts = await page.locator("h1,h2,h3").evaluateAll((items) => items.map((item) => (item.textContent ?? "").trim()));
    expect(headingTexts.filter((heading) => /^login$/i.test(heading)).length).toBe(0);

    const before = loginText;
    const notes = [`QA marker: ${marker}`];
    if (/Supabase Mode/i.test(before) && testInfo.project.name === "desktop-chromium") {
      await page.getByLabel("Email").fill(`${marker}@example.invalid`);
      await page.getByLabel("Password").fill("invalid-password-for-browser-qa");
      await page.getByRole("button", { name: "Sign In" }).click();
      await expect(page.locator("form")).toContainText(/invalid|credential|error|failed|unable/i, { timeout: 8_000 });
      notes.push("Invalid Supabase login produced a visible error.");
    } else if (/Supabase Mode/i.test(before)) {
      notes.push("Invalid Supabase login is exercised in the desktop project to keep tablet/mobile QA fast.");
    } else {
      notes.push("Mock Mode login does not test invalid Supabase credentials.");
    }

    const shot = await screenshot(page, testInfo.project.name, "login");
    record({
      project: testInfo.project.name,
      route: "/login",
      test: "login fields and invalid auth",
      status: "PASS",
      consoleErrors,
      visibleErrors: await visibleErrorLines(page),
      screenshot: shot,
      buttons: await visibleButtonTexts(page),
      forms: await visibleFormNames(page),
      notes
    });
    // Console errors are recorded in the v4.2 report instead of stopping login coverage early.
  });

  test("authenticated boss flow runs only when test credentials are provided", async ({ page }, testInfo) => {
    test.skip(qaE2EMode, "QA_E2E_MODE uses mock boss auth and does not require Supabase credentials.");
    if (!authEmail || !authPassword) {
      record({
        project: testInfo.project.name,
        test: "authenticated boss flow",
        status: "MANUAL REQUIRED",
        notes: ["SUPABASE_TEST_EMAIL and SUPABASE_TEST_PASSWORD are missing. Password was not printed or stored."]
      });
      test.skip(true, "SUPABASE_TEST_EMAIL and SUPABASE_TEST_PASSWORD are required for authenticated boss browser tests.");
    }

    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await page.getByLabel("Email").fill(authEmail!);
    await page.getByLabel("Password").fill(authPassword!);
    await page.getByRole("button", { name: "Sign In" }).click();

    await expect(page.getByText("Logout")).toBeVisible({ timeout: 20_000 });
    await expect(page.locator("body")).toContainText(/boss/i);

    for (const route of ["/", "/leads", "/leads/lead-001", "/appointments", "/appointment-settings", "/approvals", "/followups", "/quotation-readiness", "/client-files", "/reports", "/settings", "/audit-log"]) {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      await expect(page.getByText("Login required")).toHaveCount(0);
      await expect(page.locator("body")).not.toContainText(unsafeCopyPattern);
      if (responsiveRoutes.has(route)) await assertNoHorizontalScroll(page);
      await screenshot(page, testInfo.project.name, `auth-${slug(route)}`);
    }

    await page.getByText("Logout").click();
    await expect(page.getByText("Logout")).toHaveCount(0);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).toContainText("Login required");
    await expect(page.getByText("Logout")).toHaveCount(0);

    record({
      project: testInfo.project.name,
      test: "authenticated boss flow",
      status: "PASS",
      notes: ["Logged in with supplied test credentials, verified boss role text, visited protected pages, and logged out."]
    });
  });
});
