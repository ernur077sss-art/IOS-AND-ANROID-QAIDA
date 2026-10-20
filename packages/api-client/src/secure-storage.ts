/** Split auth sessions into small SecureStore records. The manifest commits last. */
export interface KeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}
type Manifest = { revision: string; count: number };
export function chunkedStorage(store: KeyValueStore, revision: () => string) {
  const manifest = async (key: string): Promise<Manifest | null> => {
    const raw = await store.getItem(key + ".manifest");
    if (!raw) return null;
    try {
      const x = JSON.parse(raw) as Manifest;
      return typeof x.revision === "string" &&
        Number.isInteger(x.count) &&
        x.count > 0 &&
        x.count < 128
        ? x
        : null;
    } catch {
      return null;
    }
  };
  const chunkKey = (key: string, m: Manifest, i: number) =>
    `${key}.${m.revision}.${i}`;
  const clean = async (key: string, m: Manifest | null) => {
    if (m)
      await Promise.all(
        Array.from({ length: m.count }, (_, i) =>
          store.removeItem(chunkKey(key, m, i)),
        ),
      );
  };
  return {
    async getItem(key: string) {
      const m = await manifest(key);
      if (!m) return null;
      const values = await Promise.all(
        Array.from({ length: m.count }, (_, i) =>
          store.getItem(chunkKey(key, m, i)),
        ),
      );
      return values.some((x) => x === null) ? null : values.join("");
    },
    async setItem(key: string, value: string) {
      const previous = await manifest(key);
      const chars = Array.from(value);
      const chunks = Array.from(
        { length: Math.max(1, Math.ceil(chars.length / 400)) },
        (_, i) => chars.slice(i * 400, (i + 1) * 400).join(""),
      );
      const next = { revision: revision(), count: chunks.length };
      if (chunks.length >= 128) throw new Error("Auth session is too large");
      try {
        for (let i = 0; i < chunks.length; i++)
          await store.setItem(chunkKey(key, next, i), chunks[i]);
        await store.setItem(key + ".manifest", JSON.stringify(next));
      } catch (error) {
        await clean(key, next);
        throw error;
      }
      await clean(key, previous);
    },
    async removeItem(key: string) {
      const m = await manifest(key);
      await store.removeItem(key + ".manifest");
      await clean(key, m);
    },
  };
}
