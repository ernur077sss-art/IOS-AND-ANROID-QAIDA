import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";

test("phone invitation joins by name, persists RSVP and denies outsiders", async ({
  browser,
  baseURL,
}) => {
  test.skip(
    !process.env.QAYDA_CLOUD_E2E,
    "Requires isolated cloud test accounts",
  );
  test.setTimeout(60000);
  const config = {
    url: "https://evnqorvwppdjdznhbwip.supabase.co",
    key: "sb_publishable_ikqOS72SiemBrOm5KkxMPw_U14NbmkO",
  };
  const accounts = JSON.parse(
    await readFile("work/e2e-accounts.json", "utf8"),
  ) as { role: string; email: string; password: string }[];
  const owner = createClient(config.url, config.key, {
    auth: { persistSession: false },
  });
  const { error } = await owner.auth.signInWithPassword(
    accounts.find((a) => a.role === "owner")!,
  );
  if (error) throw error;
  async function rpc(name: string, args: Record<string, unknown>) {
    const { data, error } = await owner.rpc(name, args);
    if (error) throw error;
    return data;
  }
  const pid = await rpc("create_plan", {
    p_listing: "00000000-0000-4000-8000-000000000101",
    p_title: "Демо · приглашение на телефон",
    p_starts: new Date(Date.now() + 86400000 * 10).toISOString(),
    p_meeting: "Демо · закрытое место встречи",
    p_request: crypto.randomUUID(),
  });
  await rpc("plan_action", {
    p_plan: pid,
    p_version: 1,
    p_action: "publish",
    p_values: {},
  });
  const invitation = await rpc("create_invitation", {
    p_plan: pid,
    p_title: "Демо · приглашение на телефон",
    p_max_uses: 2,
    p_hours: 1,
  });
  const phone = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const outsider = await browser.newContext();
  try {
    const page = await phone.newPage();
    await page.goto(`${baseURL}/invite#t=${invitation.token}`);
    await expect(
      page.getByText("Демо · закрытое место встречи", { exact: true }),
    ).toHaveCount(0);
    await page
      .getByLabel("Ваше имя", { exact: true })
      .fill("Демо · друг с телефона");
    await page
      .getByRole("button", { name: "Продолжить по имени", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Вступить в компанию", exact: true })
      .click();
    await expect(
      page.getByRole("heading", {
        name: "Демо · приглашение на телефон",
        exact: true,
      }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Иду", exact: true }).click();
    await expect
      .poll(async () => {
        const room = await rpc("get_room", { p_plan: pid });
        const guest = room.members.find(
          (m: { display_name: string }) =>
            m.display_name === "Демо · друг с телефона",
        );
        return (
          !!guest &&
          room.rsvps.some(
            (r: { user_id: string; answer: string }) =>
              r.user_id === guest.user_id && r.answer === "going",
          )
        );
      })
      .toBe(true);
    await page.reload();
    await expect(
      page.getByRole("heading", {
        name: "Демо · приглашение на телефон",
        exact: true,
      }),
    ).toBeVisible();
    const other = await outsider.newPage();
    await other.goto(`${baseURL}/plans/${pid}`);
    await expect(
      other.getByText("Демо · закрытое место встречи", { exact: true }),
    ).toHaveCount(0);
  } finally {
    await phone.close();
    await outsider.close();
    await rpc("plan_action", {
      p_plan: pid,
      p_version: 1,
      p_action: "cancel",
      p_values: {},
    });
  }
});
