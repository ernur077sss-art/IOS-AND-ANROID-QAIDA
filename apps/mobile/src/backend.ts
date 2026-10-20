import { AppState, Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import { chunkedStorage } from "@qayda/api-client/src/secure-storage";
import { client } from "@qayda/api-client";
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const storage = {
  async getItem(k: string) {
    return Platform.OS === "web"
      ? (globalThis.localStorage?.getItem(k) ?? null)
      : SecureStore.getItemAsync(k);
  },
  async setItem(k: string, v: string) {
    if (Platform.OS === "web") globalThis.localStorage?.setItem(k, v);
    else await SecureStore.setItemAsync(k, v);
  },
  async removeItem(k: string) {
    if (Platform.OS === "web") globalThis.localStorage?.removeItem(k);
    else await SecureStore.deleteItemAsync(k);
  },
};
export const db =
  url && key
    ? client(
        url,
        key,
        Platform.OS === "web"
          ? storage
          : chunkedStorage(storage, () => Crypto.randomUUID()),
      )
    : null;
if (db && Platform.OS !== "web")
  AppState.addEventListener("change", (state) => {
    if (state === "active") db.auth.startAutoRefresh();
    else db.auth.stopAutoRefresh();
  });
