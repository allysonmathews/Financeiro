import { LinearGradient } from "expo-linear-gradient";
import { ArrowLeft, Building2 } from "lucide-react-native";
import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const GRADIENT_COLORS = ["#001A3D", "#002244", "#0a2744", "#133052", "#1e3a5f"] as const;
const CARD_BG = "#ffffff";
const TITLE_COLOR = "#001A3D";
const SUBTITLE_COLOR = "#64748b";
const ICON_BG = "#f1f5f9";
const ICON_COLOR = "#001A3D";

const FRANQUIA_CARDS = [
  {
    id: "cvt",
    title: "CVT",
    description: "Fechamento Condomínio Vila Tropical",
    icon: Building2,
  },
  {
    id: "cvf",
    title: "CVF",
    description: "Fechamento Condomínio Vila Fiori",
    icon: Building2,
  },
] as const;

export default function FranquiasScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const handleCardPress = (id: string) => {
    router.push(`/franquias/${id}`);
  };

  return (
    <View style={styles.root}>
      <LinearGradient colors={[...GRADIENT_COLORS]} style={StyleSheet.absoluteFill} />

      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable
          style={styles.backButton}
          onPress={() => router.back()}
          accessibilityLabel="Voltar"
        >
          <ArrowLeft size={24} color="#ffffff" strokeWidth={2} />
        </Pressable>
        <Text style={styles.headerTitle}>Franquias</Text>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        {FRANQUIA_CARDS.map((card) => {
          const IconComponent = card.icon;
          return (
            <Pressable
              key={card.id}
              onPress={() => handleCardPress(card.id)}
              style={({ pressed }) => [
                styles.cardPressable,
                pressed && styles.cardPressablePressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel={`Abrir ${card.title}`}
            >
              <View style={styles.card}>
                <View style={styles.cardIconWrap}>
                  <IconComponent size={28} color={ICON_COLOR} strokeWidth={2} />
                </View>
                <View style={styles.cardTextWrap}>
                  <Text style={styles.cardTitle}>{card.title}</Text>
                  <Text style={styles.cardDescription}>{card.description}</Text>
                </View>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#001A3D",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  backButton: {
    padding: 8,
    marginRight: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: "#ffffff",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  cardPressable: {
    marginBottom: 16,
  },
  cardPressablePressed: {
    opacity: 0.9,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: CARD_BG,
    borderRadius: 16,
    padding: 20,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  cardIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 12,
    backgroundColor: ICON_BG,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 16,
  },
  cardTextWrap: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: TITLE_COLOR,
  },
  cardDescription: {
    fontSize: 14,
    color: SUBTITLE_COLOR,
    marginTop: 2,
  },
});
