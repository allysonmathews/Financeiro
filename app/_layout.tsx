import "../global.css";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useEffect } from "react";
import { Platform, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

const WEB_PHONE_MAX_WIDTH = 400;
const WEB_PHONE_BORDER_RADIUS = 28;
const WEB_BG = "#0d0d0d";

function WebSimulatorWrapper({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (Platform.OS === "web" && typeof document !== "undefined") {
      document.body.style.backgroundColor = WEB_BG;
      document.documentElement.style.backgroundColor = WEB_BG;
    }
  }, []);

  if (Platform.OS !== "web") return <>{children}</>;

  return (
    <View style={webStyles.page}>
      <View style={webStyles.phoneFrame}>
        {children}
      </View>
    </View>
  );
}

const webStyles = {
  page: {
    flex: 1 as const,
    minHeight: "100vh",
    backgroundColor: WEB_BG,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    padding: 24,
  },
  phoneFrame: {
    width: "100%",
    maxWidth: WEB_PHONE_MAX_WIDTH,
    flex: 1,
    maxHeight: "90vh",
    borderRadius: WEB_PHONE_BORDER_RADIUS,
    overflow: "hidden" as const,
    backgroundColor: "#001A3D",
    // Sombra e borda para efeito “celular”
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 24,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
};

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <WebSimulatorWrapper>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: "transparent" },
            animation: "slide_from_right",
          }}
        >
          <Stack.Screen name="index" />
          <Stack.Screen name="pessoal" />
          <Stack.Screen name="franquias" />
          <Stack.Screen name="ajustes" />
        </Stack>
      </WebSimulatorWrapper>
    </SafeAreaProvider>
  );
}
