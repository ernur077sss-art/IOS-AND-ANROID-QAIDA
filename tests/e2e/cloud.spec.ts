import { test, expect, type BrowserContext } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import { productFeatures } from "../../packages/domain/src/features";
const config = {
  url: "https://evnqorvwppdjdznhbwip.supabase.co",
  key: "sb_publishable_ikqOS72SiemBrOm5KkxMPw_U14NbmkO",
};
test("two real browser sessions coordinate a plan", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(90000);
  test.skip(
    !process.env.QAYDA_CLOUD_E2E,
    "Requires provisioned isolated synthetic accounts",
  );
  const accounts: { role: string; email: string; password: string }[] =
    JSON.parse(await readFile("work/e2e-accounts.json", "utf8"));
  const contexts: BrowserContext[] = [];
  try {
    for (const role of ["owner", "member"]) {
      const a = accounts.find((x) => x.role === role)!;
      const c = createClient(config.url, config.key, {
        auth: { persistSession: false },
      });
      const { data, error } = await c.auth.signInWithPassword(a);
      if (error) throw error;
      const ctx = await browser.newContext();
      await ctx.addInitScript(
        ({ session }) => {
          localStorage.setItem(
            "sb-evnqorvwppdjdznhbwip-auth-token",
            JSON.stringify(session),
          );
        },
        { session: data.session },
      );
      contexts.push(ctx);
    }
    const owner = await contexts[0].newPage();
    const member = await contexts[1].newPage();
    if (productFeatures.tripPlanning) {
      await owner.goto(
        `${baseURL}/listing/00000000-0000-4000-8000-000000000101`,
      );
      await owner.getByRole("button", { name: "Собрать компанию" }).click();
    } else {
      await owner.goto(
        `${baseURL}/create/00000000-0000-4000-8000-000000000101`,
      );
    }
    await owner.getByLabel("Название плана").fill("Демо · браузерная проверка");
    const future = new Date(Date.now() + 86400000 * 14)
      .toISOString()
      .slice(0, 16);
    await owner.getByLabel("Дата и время").fill("2026-09-25T11:23");
    await owner.getByLabel("Где встречаемся").fill("Демо · у входа в музей");
    await owner
      .getByRole("button", { name: "Создать план", exact: true })
      .click();
    await expect(owner.getByLabel("Дата и время")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    await expect(
      owner
        .getByText("Дата встречи уже прошла. Выберите будущие дату и время", {
          exact: true,
        })
        .first(),
    ).toBeVisible();
    await expect(owner).toHaveURL(/\/create\//);
    await owner.getByLabel("Дата и время").fill(future);
    await owner
      .getByRole("button", { name: "Создать план", exact: true })
      .click();
    await expect(
      owner.getByRole("heading", { name: "Демо · браузерная проверка" }),
    ).toBeVisible();
    await owner
      .getByRole("button", { name: "Предложить компании", exact: true })
      .click();
    await owner.getByRole("button", { name: "Иду", exact: true }).click();
    await owner
      .getByRole("button", { name: "Создать ссылку", exact: true })
      .click();
    const link = await owner.getByLabel("Ссылка для друзей").inputValue();
    await member.goto(link);
    await member
      .getByRole("button", { name: "Вступить в компанию", exact: true })
      .click();
    await member.getByRole("button", { name: "Иду", exact: true }).click();
    await expect(
      member.getByRole("button", { name: "Иду", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await owner.getByRole("button", { name: "Обновить комнату" }).click();
    await expect(
      owner.getByRole("heading", { name: "2 собираются пойти" }),
    ).toBeVisible();
    await owner
      .getByRole("button", { name: "Подтвердить план", exact: true })
      .click();
    await expect(owner.getByText("Подтверждён · версия 1")).toBeVisible();
    await owner.reload();
    await expect(owner.getByText("Подтверждён · версия 1")).toBeVisible();
    await owner.getByRole("button", { name: "Бюджет", exact: true }).click();
    await owner.getByLabel("Статья расходов").fill("Демо · трансфер");
    await owner.getByLabel("Сумма, ₸").fill("100.01");
    await owner
      .getByRole("button", { name: "Добавить статью", exact: true })
      .click();
    await owner
      .getByRole("button", { name: "Пересчитать для 2 участников" })
      .click();
    await expect(owner.getByRole("heading", { name: /100,01/ })).toBeVisible();
    await owner
      .getByRole("button", { name: "Обсуждение", exact: true })
      .click();
    await owner
      .getByLabel("Сообщение", { exact: true })
      .fill("Демо · встречаемся у входа");
    await owner.getByRole("button", { name: "Отправить", exact: true }).click();
    await expect(
      owner.getByText("Демо · встречаемся у входа", { exact: true }),
    ).toBeVisible();
    await owner.getByRole("button", { name: "План", exact: true }).click();
    const download = owner.waitForEvent("download");
    await owner.getByRole("button", { name: "Скачать событие .ics" }).click();
    expect((await download).suggestedFilename()).toBe("qayda-plan.ics");
    await owner
      .getByRole("button", { name: "Отменить план", exact: true })
      .click();
    await expect(owner.getByText("Отменён · версия 1")).toBeVisible();
    const submissionTitle = `Демо · событие ${Date.now()}`;
    await member.goto(`${baseURL}/submit`);
    await member.getByLabel("Название", { exact: true }).fill(submissionTitle);
    await member.getByLabel("Тип", { exact: true }).selectOption("event");
    await member.getByLabel("Дата события").fill(future);
    await member
      .getByLabel("Описание", { exact: true })
      .fill("Синтетическое событие для проверки модерации.");
    await member
      .getByLabel("Публичное место или адрес")
      .fill("Демо · общественная площадка");
    await member.getByRole("button", { name: "Сохранить черновик" }).click();
    const ownCard = member.locator(".card").filter({
      has: member.getByRole("heading", {
        name: submissionTitle,
        exact: true,
      }),
    });
    await expect(ownCard).toContainText("Черновик");
    await ownCard.getByRole("link", { name: "Редактировать" }).click();
    await member
      .getByRole("checkbox", { name: "Подтверждаю право публиковать описание" })
      .check();
    await member
      .getByRole("button", { name: "Отправить на проверку", exact: true })
      .click();
    await expect(ownCard).toContainText("На проверке");
    await owner.goto(`${baseURL}/admin`);
    const reviewCard = owner.locator(".card").filter({
      has: owner.getByRole("heading", { name: submissionTitle, exact: true }),
    });
    await reviewCard
      .getByRole("button", { name: "Опубликовать после проверки" })
      .click();
    await expect(reviewCard).toHaveCount(0);
    await member.goto(`${baseURL}/explore`);
    await expect(
      member.getByRole("heading", { name: submissionTitle, exact: true }),
    ).toBeVisible();
    await member.goto(`${baseURL}/profile`);
    await ownCard.getByRole("link", { name: "Редактировать" }).click();
    await member.getByRole("button", { name: "Сохранить черновик" }).click();
    await expect(ownCard).toContainText("Черновик");
  } finally {
    await Promise.all(contexts.map((c) => c.close()));
  }
});
