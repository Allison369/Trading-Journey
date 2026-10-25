/**
 * Root layout.
 *
 * Wraps every route in the providers that own app state and the theme, and
 * declares the tab navigator. The five tabs are the product's five sections;
 * everything else (strategies, risk, settings) is reached from within them.
 */

import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AppProvider } from "../src/state/appContext";
import { ThemeProvider, useTheme } from "../src/state/themeContext";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AppProvider>
          <ThemedStack />
        </AppProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

function ThemedStack() {
  const theme = useTheme();
  return (
    <>
      <StatusBar style={theme.name === "dark" ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.background },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="trade/[id]" options={{ title: "Trade" }} />
        <Stack.Screen name="add" options={{ title: "Add trade", presentation: "modal" }} />
        <Stack.Screen name="strategies" options={{ title: "Strategies" }} />
        <Stack.Screen name="risk" options={{ title: "Risk & Plan" }} />
        <Stack.Screen name="settings" options={{ title: "Data & Settings" }} />
      </Stack>
    </>
  );
}
