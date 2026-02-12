import { Stack } from "expo-router";

export default function FranquiasLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: "transparent" },
        animation: "slide_from_right",
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="cvt" options={{ title: "CVT" }} />
      <Stack.Screen name="cvf" options={{ title: "CVF" }} />
    </Stack>
  );
}
