/** Management API deployment. Always targets the isolated Qodex project. */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
const file = process.argv[2];
if (!/^supabase\/migrations\/\d{12}_[a-z_]+\.sql$/.test(file ?? ""))
  throw new Error("Pass one tracked SQL migration path");
const version = file.split("/").pop().replace(".sql", "");
const sql = await readFile(file, "utf8");
await mkdir("work", { recursive: true });
await writeFile(
  "work/apply-migration.sql",
  `BEGIN;\n${sql}\nINSERT INTO private.schema_migrations(version) VALUES ('${version}');\nCOMMIT;\n`,
);
const result = spawnSync(
  "npx",
  [
    "--yes",
    "supabase@2.121.0",
    "db",
    "query",
    "--linked",
    "--project-ref",
    "evnqorvwppdjdznhbwip",
    "--file",
    "work/apply-migration.sql",
  ],
  { stdio: "inherit" },
);
process.exitCode = result.status ?? 1;
