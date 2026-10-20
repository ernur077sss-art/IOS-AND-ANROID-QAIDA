import { test, expect } from "@playwright/test";
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
  await page.getByRole("button", { name: "Собрать компанию" }).click();
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
