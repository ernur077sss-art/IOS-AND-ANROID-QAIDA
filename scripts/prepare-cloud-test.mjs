import { randomBytes, randomUUID } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
await mkdir("work", { recursive: true });
let accounts;
try {
  accounts = JSON.parse(await readFile("work/e2e-accounts.json", "utf8"));
} catch {
  accounts = ["owner", "member", "outsider"].map((role) => ({
    role,
    id: randomUUID(),
    email: `qodex-${role}@qayda.example`,
    password: randomBytes(24).toString("base64url"),
  }));
  await writeFile("work/e2e-accounts.json", JSON.stringify(accounts), {
    mode: 0o600,
  });
}
const q = (s) => `'${s.replaceAll("'", "''")}'`;
const sql = accounts
  .map(
    (
      a,
    ) => `insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,email_change_token_new,recovery_token) values('00000000-0000-0000-0000-000000000000',${q(a.id)},'authenticated','authenticated',${q(a.email)},extensions.crypt(${q(a.password)},extensions.gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{}',now(),now(),'','','','') on conflict(id) do nothing;
insert into auth.identities(id,user_id,provider_id,identity_data,provider,created_at,updated_at) values(gen_random_uuid(),${q(a.id)},${q(a.id)},jsonb_build_object('sub',${q(a.id)},'email',${q(a.email)}),'email',now(),now()) on conflict(provider_id,provider) do nothing;
update public.profiles set display_name=${q("Демо · " + a.role)} where id=${q(a.id)};`,
  )
  .join("\n");
await writeFile(
  "work/provision-test-users.sql",
  "BEGIN;\n" +
    sql +
    `\nINSERT INTO private.admin_roles(user_id) VALUES (${q(accounts.find((a) => a.role === "owner").id)}) ON CONFLICT DO NOTHING;\nCOMMIT;\n`,
  { mode: 0o600 },
);
console.log(
  "Prepared three synthetic accounts for isolated Qodex environment; credentials stay in ignored work/.",
);
