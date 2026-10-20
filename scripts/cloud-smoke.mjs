import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import assert from "node:assert/strict";
const url = "https://evnqorvwppdjdznhbwip.supabase.co";
const key = "sb_publishable_ikqOS72SiemBrOm5KkxMPw_U14NbmkO";
const accounts = JSON.parse(await readFile("work/e2e-accounts.json", "utf8"));
const clients = await Promise.all(
  accounts.map(async (a) => {
    const c = createClient(url, key, { auth: { persistSession: false } });
    const { error } = await c.auth.signInWithPassword({
      email: a.email,
      password: a.password,
    });
    if (error) throw new Error(`${a.role}: ${error.message}`);
    return c;
  }),
);
const [owner, member, outsider] = clients;
async function rpc(c, name, args) {
  const { data, error } = await c.rpc(name, args);
  if (error) throw new Error(error.message);
  return data;
}
const { data: catalog, error } = await owner
  .from("listings")
  .select("id,title,city,origin")
  .eq("publication_status", "published");
assert.ifError(error);
assert.ok(catalog.length >= 6);
console.log(
  "PASS real Supabase Auth: three independent sessions; public catalog >=6",
);
const pid = await rpc(owner, "create_plan", {
  p_listing: catalog[0].id,
  p_title: "Демо · проверка двух сессий",
  p_starts: new Date(Date.now() + 86400000 * 7).toISOString(),
  p_meeting: "Демо · у главного входа",
  p_request: randomUUID(),
});
await rpc(owner, "plan_action", {
  p_plan: pid,
  p_version: 1,
  p_action: "publish",
  p_values: {},
});
const invitation = await rpc(owner, "create_invitation", {
  p_plan: pid,
  p_title: "Демо · идём вместе",
});
assert.equal(
  await rpc(member, "redeem_invitation", { p_token: invitation.token }),
  pid,
);
await rpc(member, "set_rsvp", { p_plan: pid, p_version: 1, p_answer: "going" });
await rpc(owner, "set_rsvp", { p_plan: pid, p_version: 1, p_answer: "going" });
await rpc(owner, "plan_action", {
  p_plan: pid,
  p_version: 1,
  p_action: "confirm",
  p_values: {},
});
const room = await rpc(member, "get_room", { p_plan: pid });
assert.equal(room.plan.status, "confirmed");
assert.equal(room.members.length, 2);
assert.equal(room.rsvps.length, 2);
console.log(
  "PASS create → invite → join → RSVP → confirm; persisted read in second session",
);
const { error: denied } = await outsider.rpc("get_room", { p_plan: pid });
assert.ok(denied);
const { data: hidden, error: hiddenError } = await outsider
  .from("plans")
  .select("id")
  .eq("id", pid);
assert.ifError(hiddenError);
assert.equal(hidden.length, 0);
console.log("PASS outsider denied by RPC and direct Data API");
await rpc(owner, "add_budget_item", {
  p_plan: pid,
  p_version: 1,
  p_title: "Демо · транспорт",
  p_amount: "10001",
  p_kind: "shared",
});
await rpc(owner, "recalculate_budget", { p_plan: pid, p_version: 1 });
const budget = (await rpc(member, "get_room", { p_plan: pid })).budget;
assert.equal(budget.total_minor, "10001");
assert.equal(
  Object.values(budget.shares).reduce((a, b) => a + BigInt(b), 0n),
  10001n,
);
await rpc(member, "agree_budget", {
  p_plan: pid,
  p_budget_version: budget.version,
});
console.log("PASS budget exact split and member agreement");
await rpc(owner, "plan_action", {
  p_plan: pid,
  p_version: 1,
  p_action: "revise",
  p_values: { starts_at: new Date(Date.now() + 86400000 * 8).toISOString() },
});
const stale = await rpc(member, "get_room", { p_plan: pid });
assert.equal(stale.plan.version, 2);
assert.equal(stale.rsvps[0].acknowledged_version, 1);
await rpc(owner, "remove_member", { p_plan: pid, p_user: accounts[1].id });
assert.ok((await member.rpc("get_room", { p_plan: pid })).error);
const single = await rpc(owner, "create_invitation", {
  p_plan: pid,
  p_title: "Демо · одно вступление",
  p_max_uses: 1,
  p_hours: 1,
});
const concurrent = await Promise.all(
  [member, outsider].map((c) =>
    c.rpc("redeem_invitation", { p_token: single.token }),
  ),
);
assert.equal(concurrent.filter((x) => !x.error).length, 1);
console.log(
  "PASS concurrent redemption: exactly one of two requests takes the last use",
);
await rpc(owner, "plan_action", {
  p_plan: pid,
  p_version: 2,
  p_action: "cancel",
  p_values: {},
});
console.log(
  "PASS revision invalidates RSVP; removal revokes access; test plan cancelled",
);
