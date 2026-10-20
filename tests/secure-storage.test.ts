import { it, expect } from "vitest";
import { chunkedStorage } from "../packages/api-client/src/secure-storage";
it("stores a large auth session, replaces atomically and deletes all chunks", async () => {
  const map = new Map<string, string>();
  let revision = 0;
  const store = chunkedStorage(
    {
      async getItem(k) {
        return map.get(k) ?? null;
      },
      async setItem(k, v) {
        expect(v.length).toBeLessThanOrEqual(1000);
        map.set(k, v);
      },
      async removeItem(k) {
        map.delete(k);
      },
    },
    () => String(++revision),
  );
  const token = "x".repeat(9000);
  await store.setItem("auth", token);
  expect(await store.getItem("auth")).toBe(token);
  await store.setItem("auth", "new");
  expect(await store.getItem("auth")).toBe("new");
  expect(map.size).toBe(2);
  await store.removeItem("auth");
  expect(map.size).toBe(0);
});
it("failed partial write preserves previous committed session", async () => {
  const map = new Map<string, string>();
  let fail = false;
  let rev = 0;
  const store = chunkedStorage(
    {
      async getItem(k) {
        return map.get(k) ?? null;
      },
      async setItem(k, v) {
        if (fail && k.endsWith(".1")) throw new Error("disk full");
        map.set(k, v);
      },
      async removeItem(k) {
        map.delete(k);
      },
    },
    () => String(++rev),
  );
  await store.setItem("auth", "old");
  fail = true;
  await expect(store.setItem("auth", "z".repeat(3000))).rejects.toThrow();
  expect(await store.getItem("auth")).toBe("old");
});
