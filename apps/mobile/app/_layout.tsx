import { PreferencesProvider } from "../src/Preferences";
import { Stack } from "expo-router";
import { NativeProvider } from "../src/App";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
export default function Layout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <PreferencesProvider>
        <NativeProvider>
          <Stack screenOptions={{ headerShown: false }} />
        </NativeProvider>
      </PreferencesProvider>
    </SafeAreaProvider>
  );
}
