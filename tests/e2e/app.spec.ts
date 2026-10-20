import { test, expect } from "@playwright/test";
import { productFeatures } from "../../packages/domain/src/features";
test("catalog, mobile layout, place detail and auth boundary", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Куда поедем вместе?" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /Музей Абая в Семее|По следам Абая/ }),
  ).toBeVisible();
  for (const width of [375, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  if (!productFeatures.tripPlanning)
    await expect(page.locator('a[href="/plans"]')).toHaveCount(0);
  if (!productFeatures.providers)
    await expect(page.locator('a[href="/providers"]')).toHaveCount(0);
  await page.getByRole("combobox", { name: "Город" }).selectOption("almaty");
  await expect(
    page.getByRole("heading", {
      name: /Театр оперы и балета имени Абая|Вечер оперы и балета/,
    }),
  ).toBeVisible();
  await page.getByRole("searchbox", { name: "Поиск мест" }).fill("оперы");
  await page
    .getByRole("heading", {
      name: /Театр оперы и балета имени Абая|Вечер оперы и балета/,
    })
    .click();
  await expect(
    page.getByRole("heading", {
      name: /Театр оперы и балета имени Абая|Вечер оперы и балета/,
      level: 1,
    }),
  ).toBeVisible();
  if (!productFeatures.tripPlanning)
    await expect(
      page.getByRole("button", { name: "Собрать компанию" }),
    ).toHaveCount(0);
  if (!productFeatures.providers)
    await expect(
      page.getByRole("link", { name: "Найти гида, водителя или турфирму" }),
    ).toHaveCount(0);
  if (!productFeatures.tripPlanning)
    await expect(page.locator('a[href="/plans"]')).toHaveCount(0);
  if (!productFeatures.providers)
    await expect(page.locator('a[href="/providers"]')).toHaveCount(0);
  // The feature is hidden, not removed: its direct route still enforces authentication.
  if (productFeatures.tripPlanning)
    await page.getByRole("button", { name: "Собрать компанию" }).click();
  else await page.goto(page.url().replace("/listing/", "/create/"));
  await expect(
    page
      .getByRole("heading", { name: "Вход в Qayda" })
      .or(page.getByRole("alert").filter({ hasText: "Backend" })),
  ).toBeVisible();
});
test("invalid invitation never joins and hides private data", async ({
  page,
}) => {
  await page.goto("/invite#t=invalid");
  if (await page.getByText(/ДЕМОПРОСМОТР/).count()) {
    await expect(page.getByText(/ДЕМОПРОСМОТР/)).toBeVisible();
  } else
    await expect(
      page.getByRole("alert").filter({ hasText: "Приглашение" }),
    ).toBeVisible();
  await expect(page).toHaveURL(/\/invite$/);
  await expect(
    page.getByRole("button", { name: "Вступить в компанию" }),
  ).toHaveCount(0);
});
