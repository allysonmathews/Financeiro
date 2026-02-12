import { LinearGradient } from "expo-linear-gradient";
import { ArrowLeft } from "lucide-react-native";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PieChart } from "react-native-chart-kit";
import { supabase } from "../../services/supabase";

const GRADIENT_COLORS = ["#001A3D", "#002244", "#0a2744", "#133052", "#1e3a5f"] as const;
const CARD_BG = "#ffffff";
const TITLE_COLOR = "#001A3D";
const SUBTITLE_COLOR = "#64748b";
const INPUT_BG = "#f1f5f9";
const BUTTON_BG = "#001A3D";
const GREEN_DARK = "#166534";
const RED_DARK = "#991b1b";
const GREEN_BG = "#ecfdf5";
const RED_BG = "#fef2f2";
const CHART_NAVY = "#001A3D";
const CHART_AZUL_CLARO = "#1e3a5f";

type QuemPagou = "allyson" | "gabriel";

interface LancamentoRow {
  id: string;
  valor: number;
  descricao: string;
  quem_pagou: string;
  tipo_caixa: string;
  created_at: string;
}

interface SaldoInfo {
  texto: string;
  positivo: boolean; // true = Allyson recebe (verde), false = Allyson deve (vermelho)
}

function formatarDataParaDDMM(iso: string): string {
  try {
    const d = new Date(iso);
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    return `${day}/${month}`;
  } catch {
    return "--/--";
  }
}

export default function PessoalScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [valor, setValor] = useState("");
  const [descricao, setDescricao] = useState("");
  const [quemPagou, setQuemPagou] = useState<QuemPagou>("allyson");
  const [lancamentos, setLancamentos] = useState<LancamentoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saldo, setSaldo] = useState<SaldoInfo>({ texto: "Carregando...", positivo: true });

  const carregarLancamentos = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("lancamentos")
        .select("id, valor, descricao, quem_pagou, tipo_caixa, created_at")
        .eq("tipo_caixa", "Pessoal")
        .order("created_at", { ascending: false });

      if (error) throw error;
      const rows = ((data as LancamentoRow[]) ?? []).filter((r) => r.tipo_caixa === "Pessoal");
      setLancamentos(rows);

      const totalAllyson = rows
        .filter((r) => (r.quem_pagou || "").toLowerCase() === "allyson")
        .reduce((s, r) => s + Number(r.valor || 0), 0);
      const totalGabriel = rows
        .filter((r) => (r.quem_pagou || "").toLowerCase() === "gabriel")
        .reduce((s, r) => s + Number(r.valor || 0), 0);
      const diff = totalAllyson - totalGabriel;

      if (Math.abs(diff) < 0.01) {
        setSaldo({ texto: "Contas em dia", positivo: true });
      } else if (diff > 0) {
        setSaldo({
          texto: `Gabriel deve R$ ${diff.toFixed(2).replace(".", ",")} para Allyson`,
          positivo: true,
        });
      } else {
        setSaldo({
          texto: `Allyson deve R$ ${Math.abs(diff).toFixed(2).replace(".", ",")} para Gabriel`,
          positivo: false,
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro ao carregar.";
      setSaldo({ texto: msg, positivo: false });
      setLancamentos([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    carregarLancamentos();
  }, [carregarLancamentos]);

  const handleLancar = async () => {
    const v = parseFloat(valor.replace(",", "."));
    if (isNaN(v) || v <= 0 || !descricao.trim()) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("lancamentos").insert({
        valor: v,
        descricao: descricao.trim(),
        quem_pagou: quemPagou === "allyson" ? "Allyson" : "Gabriel",
        tipo_caixa: "Pessoal",
      });
      if (error) throw error;
      setValor("");
      setDescricao("");
      await carregarLancamentos();
      if (Platform.OS !== "web") {
        Alert.alert("Sucesso", "Lançamento salvo.");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro ao salvar.";
      if (Platform.OS !== "web") Alert.alert("Erro", msg);
    } finally {
      setSaving(false);
    }
  };

  const formatarValor = (v: number) => `R$ ${v.toFixed(2).replace(".", ",")}`;

  const totalAllyson = lancamentos
    .filter((r) => (r.quem_pagou || "").toLowerCase() === "allyson")
    .reduce((s, r) => s + Number(r.valor || 0), 0);
  const totalGabriel = lancamentos
    .filter((r) => (r.quem_pagou || "").toLowerCase() === "gabriel")
    .reduce((s, r) => s + Number(r.valor || 0), 0);
  const chartWidth = Math.max(200, Dimensions.get("window").width - 80);
  const chartHeight = Math.round(chartWidth * 0.55);
  const chartData = [
    {
      name: "Allyson",
      total: totalAllyson,
      color: CHART_NAVY,
      legendFontColor: "#e2e8f0",
      legendFontSize: 12,
    },
    {
      name: "Gabriel",
      total: totalGabriel,
      color: CHART_AZUL_CLARO,
      legendFontColor: "#e2e8f0",
      legendFontSize: 12,
    },
  ].filter((d) => d.total > 0);

  const chartConfig = {
    color: () => "#e2e8f0",
    labelColor: () => "#e2e8f0",
    backgroundColor: "transparent",
    decimalPlaces: 0,
  };

  if (loading && lancamentos.length === 0) {
    return (
      <View style={styles.root}>
        <LinearGradient colors={[...GRADIENT_COLORS]} style={StyleSheet.absoluteFill} />
        <View style={[styles.loadingWrap, { paddingTop: insets.top + 120 }]}>
          <ActivityIndicator size="large" color="#ffffff" />
          <Text style={styles.loadingText}>Carregando lançamentos...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={[...GRADIENT_COLORS]}
        style={StyleSheet.absoluteFill}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={[styles.keyboardView, { paddingTop: insets.top }]}
      >
        <View style={styles.header}>
          <Pressable
            style={styles.backButton}
            onPress={() => router.back()}
            accessibilityLabel="Voltar"
          >
            <ArrowLeft size={24} color="#ffffff" strokeWidth={2} />
          </Pressable>
          <Text style={styles.headerTitle}>Financeiro Pessoal</Text>
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {loading ? (
            <View style={styles.loadingInline}>
              <ActivityIndicator size="small" color="#ffffff" />
            </View>
          ) : null}

          <View
            style={[
              styles.saldoCard,
              saldo.positivo ? styles.saldoCardVerde : styles.saldoCardVermelho,
            ]}
          >
            <Text
              style={[
                styles.saldoTexto,
                saldo.positivo ? styles.saldoTextoVerde : styles.saldoTextoVermelho,
              ]}
            >
              {saldo.texto}
            </Text>
          </View>

          {chartData.length > 0 ? (
            <View style={styles.chartCard}>
              <Text style={styles.chartTitle}>Divisão de gastos</Text>
              <PieChart
                data={chartData}
                width={chartWidth}
                height={chartHeight}
                chartConfig={chartConfig}
                accessor="total"
                backgroundColor="transparent"
                paddingLeft="0"
                absolute
              />
            </View>
          ) : null}

          <View style={styles.formCard}>
            <Text style={styles.formLabel}>Valor (R$)</Text>
            <TextInput
              style={styles.input}
              placeholder="0,00"
              placeholderTextColor={SUBTITLE_COLOR}
              value={valor}
              onChangeText={setValor}
              keyboardType="decimal-pad"
              editable={!saving}
            />

            <Text style={styles.formLabel}>Descrição</Text>
            <TextInput
              style={styles.input}
              placeholder="Ex: Mercado, Uber..."
              placeholderTextColor={SUBTITLE_COLOR}
              value={descricao}
              onChangeText={setDescricao}
              editable={!saving}
            />

            <Text style={styles.formLabel}>Quem pagou?</Text>
            <View style={styles.toggleRow}>
              <Pressable
                style={[
                  styles.toggleButton,
                  quemPagou === "allyson" && styles.toggleButtonActive,
                ]}
                onPress={() => setQuemPagou("allyson")}
                disabled={saving}
              >
                <Text
                  style={[
                    styles.toggleText,
                    quemPagou === "allyson" && styles.toggleTextActive,
                  ]}
                >
                  Allyson
                </Text>
              </Pressable>
              <Pressable
                style={[
                  styles.toggleButton,
                  quemPagou === "gabriel" && styles.toggleButtonActive,
                ]}
                onPress={() => setQuemPagou("gabriel")}
                disabled={saving}
              >
                <Text
                  style={[
                    styles.toggleText,
                    quemPagou === "gabriel" && styles.toggleTextActive,
                  ]}
                >
                  Gabriel
                </Text>
              </Pressable>
            </View>

            <Pressable
              style={({ pressed }) => [
                styles.lancarButton,
                pressed && styles.lancarButtonPressed,
                saving && styles.lancarButtonDisabled,
              ]}
              onPress={handleLancar}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text style={styles.lancarButtonText}>Lançar</Text>
              )}
            </Pressable>
          </View>

          <Text style={styles.secaoTitulo}>Últimos lançamentos</Text>
          {lancamentos.length === 0 ? (
            <Text style={styles.emptyList}>Nenhum lançamento ainda.</Text>
          ) : (
            lancamentos.slice(0, 10).map((item) => (
              <View key={item.id} style={styles.lancamentoCard}>
                <View style={styles.lancamentoInfo}>
                  <Text style={styles.lancamentoDescricao}>{item.descricao}</Text>
                  <Text style={styles.lancamentoMeta}>
                    {formatarDataParaDDMM(item.created_at)} · Quem pagou:{" "}
                    {item.quem_pagou || "-"}
                  </Text>
                </View>
                <Text style={styles.lancamentoValor}>{formatarValor(Number(item.valor))}</Text>
              </View>
            ))
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#001A3D",
  },
  keyboardView: {
    flex: 1,
  },
  loadingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-start",
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: "#94a3b8",
  },
  loadingInline: {
    paddingVertical: 8,
    alignItems: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    padding: 8,
    marginRight: 8,
  },
  headerTitle: {
    fontSize: 18,
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
  saldoCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
  },
  saldoCardVerde: {
    backgroundColor: GREEN_BG,
    borderColor: "#a7f3d0",
  },
  saldoCardVermelho: {
    backgroundColor: RED_BG,
    borderColor: "#fecaca",
  },
  saldoTexto: {
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
  },
  saldoTextoVerde: {
    color: GREEN_DARK,
  },
  saldoTextoVermelho: {
    color: RED_DARK,
  },
  chartCard: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    alignItems: "center",
  },
  chartTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#e2e8f0",
    marginBottom: 8,
  },
  formCard: {
    backgroundColor: CARD_BG,
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  formLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: TITLE_COLOR,
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    backgroundColor: INPUT_BG,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: TITLE_COLOR,
  },
  toggleRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
  },
  toggleButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: INPUT_BG,
    alignItems: "center",
  },
  toggleButtonActive: {
    backgroundColor: BUTTON_BG,
  },
  toggleText: {
    fontSize: 15,
    fontWeight: "600",
    color: SUBTITLE_COLOR,
  },
  toggleTextActive: {
    color: "#ffffff",
  },
  lancarButton: {
    marginTop: 20,
    backgroundColor: BUTTON_BG,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
  },
  lancarButtonPressed: {
    opacity: 0.9,
  },
  lancarButtonDisabled: {
    opacity: 0.7,
  },
  lancarButtonText: {
    fontSize: 17,
    fontWeight: "700",
    color: "#ffffff",
  },
  secaoTitulo: {
    fontSize: 16,
    fontWeight: "700",
    color: "#ffffff",
    marginBottom: 12,
  },
  emptyList: {
    fontSize: 14,
    color: "#94a3b8",
  },
  lancamentoCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: CARD_BG,
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 4,
    borderLeftWidth: 4,
    borderLeftColor: BUTTON_BG,
  },
  lancamentoInfo: {
    flex: 1,
  },
  lancamentoDescricao: {
    fontSize: 16,
    fontWeight: "700",
    color: TITLE_COLOR,
  },
  lancamentoMeta: {
    fontSize: 12,
    color: SUBTITLE_COLOR,
    marginTop: 4,
  },
  lancamentoValor: {
    fontSize: 16,
    fontWeight: "700",
    color: TITLE_COLOR,
  },
});
