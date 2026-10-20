import { readFile, writeFile } from "node:fs/promises";
const entries = JSON.parse(await readFile("data/catalog.json", "utf8"));
const quote = (v) =>
  v == null ? "null" : `'${String(v).replaceAll("'", "''")}'`;
const sql = entries
  .map(
    (e) =>
      `insert into public.listings(id,title,city,category,summary,address,source_url,checked_at,origin,publication_status,out_of_city,verified_fields) values(${[e.id, e.title, e.city, e.category, e.summary, e.address, e.source_url, "2026-10-20T11:00:00Z", "real_verified", "published"].map(quote).join(",")},${!!e.out_of_city},array[${e.verified_fields.map(quote).join(",")}]) on conflict(id) do update set out_of_city=excluded.out_of_city,verified_fields=excluded.verified_fields;`,
  )
  .join("\n");
await writeFile(
  "supabase/seed.sql",
  "-- Verified minimum fields only. Prices, schedules and coordinates unknown. Original illustrations only.\n" +
    sql +
    "\n",
);
