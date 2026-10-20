import { test, expect } from "@playwright/test";

test("two languages, persistent reading mode, open data and keyboard access", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Қазақша", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "kk");
  await expect(
    page.getByRole("heading", { name: "Бірге қайда барамыз?" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Өңір мәдениеті сандармен" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Ірі мәтін/ }).click();
  await expect(page.locator("html")).toHaveAttribute("data-reading", "large");
  for (const width of [375, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const controls = page.locator(".display-controls button");
    for (const control of await controls.all())
      expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "kk");
  await expect(page.locator("html")).toHaveAttribute("data-reading", "large");
  await page.goto("/open-data?city=almaty");
  await expect(page.getByText("Алматы қаласы", { exact: true })).toBeVisible();
  await expect(page.locator(".culture-facts strong").first()).toHaveText("22");
  const response = await page.request.get("/open/culture-2025.json");
  expect(response.ok()).toBe(true);
  expect((await response.json()).regions.semey.museums).toBe(10);
  await expect(
    page.getByRole("link", { name: /JSON деректерін жүктеу/ }),
  ).toHaveAttribute("download", "");
  await page.getByRole("link", { name: "Музейлерді қарау" }).click();
  await expect(
    page.getByRole("button", { name: "Музейлер", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("combobox", { name: "Қала" })).toHaveValue(
    "almaty",
  );
  await page.getByRole("button", { name: "Русский", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Каталог впечатлений" }),
  ).toBeVisible();
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Перейти к содержанию" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();
});
