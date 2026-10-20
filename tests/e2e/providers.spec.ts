import { test, expect, type BrowserContext } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
test("provider onboarding, independent review, solo request and confirmed terms", async ({
  browser,
  baseURL,
}) => {
  test.skip(!process.env.QAYDA_CLOUD_E2E, "Requires isolated cloud accounts");
  test.setTimeout(150000);
  const config = {
    url: "https://evnqorvwppdjdznhbwip.supabase.co",
    key: "sb_publishable_ikqOS72SiemBrOm5KkxMPw_U14NbmkO",
  };
  const accounts = JSON.parse(
    await readFile("work/e2e-accounts.json", "utf8"),
  ) as { role: string; email: string; password: string }[];
  const contexts: BrowserContext[] = [];
  const clients = [];
  let providerId: string | undefined;
  const name = `Демо · гид ${Date.now()}`,
    offerName = `Демо · прогулка ${Date.now()}`;
  try {
    for (const role of ["owner", "member"]) {
      const c = createClient(config.url, config.key, {
        auth: { persistSession: false },
      });
      const { data, error } = await c.auth.signInWithPassword(
        accounts.find((a) => a.role === role)!,
      );
      if (error) throw error;
      clients.push(c);
      const ctx = await browser.newContext();
      await ctx.addInitScript(
        ({ session }) =>
          localStorage.setItem(
            "sb-evnqorvwppdjdznhbwip-auth-token",
            JSON.stringify(session),
          ),
        { session: data.session },
      );
      contexts.push(ctx);
    }
    const admin = await contexts[0].newPage(),
      supplier = await contexts[1].newPage();
    await supplier.goto(`${baseURL}/partner`);
    await supplier.getByLabel("Имя или название").fill(name);
    await supplier.getByLabel("Кто вы").selectOption("guide");
    await supplier
      .getByLabel("О ваших услугах")
      .fill("Демо-профиль для проверки. Реальная экскурсия не продаётся.");
    await supplier.getByLabel("Телефон для публикации").fill("+70000000001");
    await supplier
      .getByRole("checkbox", { name: /Разрешаю публиковать/ })
      .check();
    await supplier
      .getByRole("button", {
        name: "Отправить профиль на проверку",
        exact: true,
      })
      .click();
    await expect(
      supplier.getByRole("status").filter({ hasText: /отправлен/ }),
    ).toContainText("Профиль отправлен");
    const workspace = await clients[1].rpc("provider_workspace");
    providerId = workspace.data.providers.find(
      (p: { name: string }) => p.name === name,
    ).id;
    await admin.goto(`${baseURL}/partner-review`);
    await admin
      .locator("article")
      .filter({ hasText: name })
      .getByRole("button", { name: "Опубликовать", exact: true })
      .click();
    await expect(admin.getByRole("heading", { name, exact: true })).toHaveCount(
      0,
    );
    await supplier.reload();
    await supplier
      .getByLabel("Ваш профиль", { exact: true })
      .selectOption(providerId!);
    await supplier
      .getByLabel("Место или направление")
      .selectOption("00000000-0000-4000-8000-000000000101");
    await supplier.getByLabel("Название услуги").fill(offerName);
    await supplier
      .getByLabel("Программа и маршрут")
      .fill("Синтетическая программа для проверки заявки на одного человека.");
    await supplier.getByLabel("Откуда выезжаем").fill("Демо · у музея");
    await supplier.getByLabel("Что включено").fill("Демо · сопровождение");
    await supplier
      .getByLabel("Что оплачивается отдельно")
      .fill("Демо · транспорт");
    await supplier
      .getByLabel("Условия отмены")
      .fill("Демо · отмена по согласованию");
    await supplier.getByLabel("Стоимость в тенге").fill("5000");
    await supplier
      .getByRole("button", {
        name: "Отправить услугу на проверку",
        exact: true,
      })
      .click();
    await expect(
      supplier.getByRole("status").filter({ hasText: /отправлен/ }),
    ).toContainText("Услуга отправлена");
    await admin.reload();
    await admin
      .locator("article")
      .filter({ hasText: offerName })
      .getByRole("button", { name: "Опубликовать", exact: true })
      .click();
    await expect(
      admin.getByRole("heading", { name: offerName, exact: true }),
    ).toHaveCount(0);
    const phone = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    contexts.push(phone);
    const customer = await phone.newPage();
    await customer.goto(`${baseURL}/providers/${providerId}`);
    await customer
      .getByRole("link", { name: "Запросить поездку", exact: true })
      .click();
    await customer
      .getByLabel("Ваше имя", { exact: true })
      .fill("Демо · одиночный путешественник");
    await customer
      .getByRole("button", { name: "Продолжить по имени", exact: true })
      .click();
    await expect(
      customer.getByRole("heading", { name: "Запросить поездку", exact: true }),
    ).toBeVisible();
    await customer.getByLabel("Количество гостей").fill("1");
    await customer
      .getByLabel("Желаемые дата")
      .fill(new Date(Date.now() + 86400000 * 12).toISOString().slice(0, 16));
    await customer.getByLabel("Контактное лицо").fill("Демо · клиент");
    await customer.getByLabel("Телефон для ответа").fill("+70000000002");
    await customer.getByRole("checkbox", { name: /Разрешаю передать/ }).check();
    await customer
      .getByRole("button", { name: "Отправить заявку", exact: true })
      .click();
    await expect(
      customer.getByRole("heading", { name: "Мои заявки", exact: true }),
    ).toBeVisible();
    const card = customer.locator("article").filter({ hasText: offerName });
    await expect(card).toContainText("Заявка отправлена");
    await supplier.goto(`${baseURL}/requests`);
    const incoming = supplier.locator("article").filter({ hasText: offerName });
    await incoming.getByLabel("Итоговая стоимость за всех").fill("5500");
    await incoming
      .getByLabel("Ответ клиенту")
      .fill("Демо · готов провести экскурсию");
    await incoming
      .getByRole("button", { name: "Предложить условия", exact: true })
      .click();
    await expect(
      supplier
        .locator("article")
        .filter({ hasText: offerName })
        .getByText("Условия от исполнителя", { exact: true }),
    ).toBeVisible();
    await customer
      .getByRole("button", { name: "Обновить заявки", exact: true })
      .click();
    await customer
      .locator("article")
      .filter({ hasText: offerName })
      .getByRole("button", { name: "Принять условия", exact: true })
      .click();
    await expect(
      customer
        .locator("article")
        .filter({ hasText: offerName })
        .getByText("Условия приняты", { exact: true }),
    ).toBeVisible();
    await customer.reload();
    await expect(
      customer.locator("article").filter({ hasText: offerName }),
    ).toContainText("Условия приняты");
  } finally {
    // Hide synthetic fixtures from the public catalogue and moderation queue.
    if (clients[1] && clients[0]) {
      const w = await clients[1].rpc("provider_workspace");
      const p = w.data?.providers.find(
        (x: { id: string; name: string }) =>
          x.id === providerId || x.name === name,
      );
      for (const o of (w.data?.offers ?? []).filter(
        (o: { title: string }) => o.title === offerName,
      ))
        await clients[0].rpc("review_partner", {
          p_kind: "offer",
          p_id: o.id,
          p_version: o.version,
          p_publish: false,
          p_reason: "Демо-проверка завершена",
        });
      if (p)
        await clients[0].rpc("review_partner", {
          p_kind: "provider",
          p_id: p.id,
          p_version: p.version,
          p_publish: false,
          p_reason: "Демо-проверка завершена",
        });
    }
    for (const ctx of contexts) await ctx.close();
  }
});
