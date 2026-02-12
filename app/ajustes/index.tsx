import { LinearGradient } from "expo-linear-gradient";
import { ArrowLeft, Pencil, Plus, Trash2 } from "lucide-react-native";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../../services/supabase";

const GRADIENT_COLORS = ["#001A3D", "#002244", "#0a2744", "#133052", "#1e3a5f"] as const;
const CARD_BG = "#ffffff";
const TITLE_COLOR = "#001A3D";
const SUBTITLE_COLOR = "#64748b";
const INPUT_BG = "#f1f5f9";
const BUTTON_BG = "#001A3D";

export type CategoriaGasto = "padrao" | "variavel" | "esporadico";

const CATEGORIAS: { key: CategoriaGasto; label: string; subtitle: string }[] = [
  { key: "padrao", label: "Gasto Padrão", subtitle: "Ex: Aluguel, SGP, Link" },
  { key: "variavel", label: "Padrão Variável", subtitle: "Ex: Taxas de boleto, energia" },
  { key: "esporadico", label: "Esporádico", subtitle: "Ex: Manutenção, equipamento" },
];

interface GastoFixo {
  id: string;
  fornecedor: string;
  valor: number;
  categoria: string;
  created_at: string;
}

function formatarValor(v: number) {
  return `R$ ${v.toFixed(2).replace(".", ",")}`;
}

function getCategoriaLabel(key: string) {
  return CATEGORIAS.find((c) => c.key === key)?.label ?? key;
}

export default function AjustesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [lista, setLista] = useState<GastoFixo[]>([]);
  const [loading, setLoading] = useState(true);
  const [abaAtiva, setAbaAtiva] = useState<CategoriaGasto>("padrao");
  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [fornecedor, setFornecedor] = useState("");
  const [valor, setValor] = useState("");
  const [categoriaModal, setCategoriaModal] = useState<CategoriaGasto>("padrao");
  const [saving, setSaving] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("gastos_fixos_padrao")
        .select("id, fornecedor, valor, categoria, created_at")
        .order("fornecedor", { ascending: true });
      if (error) throw error;
      setLista((data as GastoFixo[]) ?? []);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro ao carregar.";
      if (Alert.alert) Alert.alert("Erro", msg);
      setLista([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const listaFiltrada = lista.filter(
    (item) => (item.categoria || "padrao") === abaAtiva
  );

  const abrirNovo = () => {
    setEditingId(null);
    setFornecedor("");
    setValor("");
    setCategoriaModal(abaAtiva);
    setModalVisible(true);
  };

  const abrirEditar = (item: GastoFixo) => {
    setEditingId(item.id);
    setFornecedor(item.fornecedor || "");
    setValor(String(item.valor ?? ""));
    setCategoriaModal((item.categoria as CategoriaGasto) || "padrao");
    setModalVisible(true);
  };

  const fecharModal = () => {
    setModalVisible(false);
    setEditingId(null);
    setFornecedor("");
    setValor("");
    setCategoriaModal(abaAtiva);
  };

  const salvar = async () => {
    const nome = fornecedor.trim();
    const v = parseFloat(valor.replace(",", "."));
    if (!nome || isNaN(v) || v < 0) return;
    setSaving(true);
    try {
      if (editingId) {
        const { error } = await supabase
          .from("gastos_fixos_padrao")
          .update({ fornecedor: nome, valor: v, categoria: categoriaModal })
          .eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("gastos_fixos_padrao").insert({
          fornecedor: nome,
          valor: v,
          categoria: categoriaModal,
        });
        if (error) throw error;
      }
      fecharModal();
      await carregar();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro ao salvar.";
      Alert.alert("Erro", msg);
    } finally {
      setSaving(false);
    }
  };

  const excluir = (item: GastoFixo) => {
    Alert.alert(
      "Excluir gasto",
      `Excluir "${item.fornecedor}" (${formatarValor(Number(item.valor))})?`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Excluir",
          style: "destructive",
          onPress: async () => {
            try {
              const { error } = await supabase
                .from("gastos_fixos_padrao")
                .delete()
                .eq("id", item.id);
              if (error) throw error;
              await carregar();
            } catch (e) {
              const msg = e instanceof Error ? e.message : "Erro ao excluir.";
              Alert.alert("Erro", msg);
            }
          },
        },
      ]
    );
  };

  return (
    <View style={styles.root}>
      <LinearGradient colors={[...GRADIENT_COLORS]} style={StyleSheet.absoluteFill} />

      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable style={styles.backButton} onPress={() => router.back()} accessibilityLabel="Voltar">
          <ArrowLeft size={24} color="#ffffff" strokeWidth={2} />
        </Pressable>
        <Text style={styles.headerTitle}>Ajustes</Text>
      </View>

      <Text style={styles.sectionTitle}>Gastos fixos padrão (condomínios)</Text>

      {/* Abas */}
      <View style={styles.tabs}>
        {CATEGORIAS.map((cat) => (
          <Pressable
            key={cat.key}
            style={[
              styles.tab,
              abaAtiva === cat.key && styles.tabActive,
            ]}
            onPress={() => setAbaAtiva(cat.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: abaAtiva === cat.key }}
            accessibilityLabel={cat.label}
          >
            <Text
              style={[
                styles.tabLabel,
                abaAtiva === cat.key && styles.tabLabelActive,
              ]}
              numberOfLines={1}
            >
              {cat.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.abaSubtitle}>
          {CATEGORIAS.find((c) => c.key === abaAtiva)?.subtitle}
        </Text>
        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color="#ffffff" />
            <Text style={styles.loadingText}>Carregando...</Text>
          </View>
        ) : listaFiltrada.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>Nenhum gasto nesta categoria.</Text>
            <Text style={styles.emptySubtext}>
              Toque em "Adicionar Novo Gasto" para cadastrar.
            </Text>
          </View>
        ) : (
          listaFiltrada.map((item) => (
            <View key={item.id} style={styles.rowCard}>
              <View style={styles.rowInfo}>
                <Text style={styles.rowFornecedor}>{item.fornecedor}</Text>
                <Text style={styles.rowValor}>{formatarValor(Number(item.valor))}</Text>
              </View>
              <View style={styles.rowActions}>
                <Pressable
                  style={styles.iconButton}
                  onPress={() => abrirEditar(item)}
                  accessibilityLabel="Editar"
                >
                  <Pencil size={20} color="#001A3D" strokeWidth={2} />
                </Pressable>
                <Pressable
                  style={[styles.iconButton, styles.iconButtonDanger]}
                  onPress={() => excluir(item)}
                  accessibilityLabel="Excluir"
                >
                  <Trash2 size={20} color="#b91c1c" strokeWidth={2} />
                </Pressable>
              </View>
            </View>
          ))
        )}

        <Pressable
          style={({ pressed }) => [styles.addButton, pressed && styles.addButtonPressed]}
          onPress={abrirNovo}
        >
          <Plus size={22} color="#ffffff" strokeWidth={2.5} />
          <Text style={styles.addButtonText}>Adicionar Novo Gasto</Text>
        </Pressable>
      </ScrollView>

      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={fecharModal}
      >
        <Pressable style={styles.modalOverlay} onPress={fecharModal}>
          <Pressable style={styles.modalBox} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>
              {editingId ? "Editar gasto" : "Novo gasto fixo"}
            </Text>
            <Text style={styles.modalLabel}>Categoria</Text>
            <View style={styles.modalCategoriaRow}>
              {CATEGORIAS.map((cat) => (
                <Pressable
                  key={cat.key}
                  style={[
                    styles.modalCategoriaBtn,
                    categoriaModal === cat.key && styles.modalCategoriaBtnActive,
                  ]}
                  onPress={() => setCategoriaModal(cat.key)}
                  disabled={saving}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: categoriaModal === cat.key }}
                  accessibilityLabel={cat.label}
                >
                  <Text
                    style={[
                      styles.modalCategoriaBtnText,
                      categoriaModal === cat.key && styles.modalCategoriaBtnTextActive,
                    ]}
                    numberOfLines={1}
                  >
                    {cat.label}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.modalLabel}>Fornecedor</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Ex: Limpeza, Portaria..."
              placeholderTextColor={SUBTITLE_COLOR}
              value={fornecedor}
              onChangeText={setFornecedor}
              editable={!saving}
            />
            <Text style={styles.modalLabel}>Valor (R$)</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="0,00"
              placeholderTextColor={SUBTITLE_COLOR}
              value={valor}
              onChangeText={setValor}
              keyboardType="decimal-pad"
              editable={!saving}
            />
            <View style={styles.modalButtons}>
              <Pressable
                style={[styles.modalBtn, styles.modalBtnCancel]}
                onPress={fecharModal}
                disabled={saving}
              >
                <Text style={styles.modalBtnCancelText}>Cancelar</Text>
              </Pressable>
              <Pressable
                style={[styles.modalBtn, styles.modalBtnSave, saving && styles.modalBtnDisabled]}
                onPress={salvar}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text style={styles.modalBtnSaveText}>Salvar</Text>
                )}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
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
    fontSize: 18,
    fontWeight: "600",
    color: "#ffffff",
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "rgba(255,255,255,0.8)",
    marginBottom: 10,
    paddingHorizontal: 16,
  },
  tabs: {
    flexDirection: "row",
    paddingHorizontal: 16,
    marginBottom: 12,
    gap: 8,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  tabActive: {
    backgroundColor: "rgba(255,255,255,0.25)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.4)",
  },
  tabLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "rgba(255,255,255,0.8)",
  },
  tabLabelActive: {
    color: "#ffffff",
  },
  abaSubtitle: {
    fontSize: 12,
    color: "#94a3b8",
    marginBottom: 12,
    paddingHorizontal: 16,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 0,
  },
  loadingWrap: {
    paddingVertical: 32,
    alignItems: "center",
  },
  loadingText: {
    marginTop: 8,
    fontSize: 14,
    color: "#94a3b8",
  },
  emptyCard: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 16,
    padding: 24,
    marginBottom: 16,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#e2e8f0",
  },
  emptySubtext: {
    fontSize: 14,
    color: "#94a3b8",
    marginTop: 4,
  },
  rowCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: CARD_BG,
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    borderLeftWidth: 4,
    borderLeftColor: BUTTON_BG,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 4,
  },
  rowInfo: {
    flex: 1,
  },
  rowFornecedor: {
    fontSize: 16,
    fontWeight: "700",
    color: TITLE_COLOR,
  },
  rowValor: {
    fontSize: 15,
    fontWeight: "600",
    color: SUBTITLE_COLOR,
    marginTop: 2,
  },
  rowActions: {
    flexDirection: "row",
    gap: 8,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: INPUT_BG,
    alignItems: "center",
    justifyContent: "center",
  },
  iconButtonDanger: {
    backgroundColor: "#fee2e2",
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: BUTTON_BG,
    borderRadius: 14,
    paddingVertical: 16,
    marginTop: 8,
  },
  addButtonPressed: {
    opacity: 0.9,
  },
  addButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#ffffff",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalBox: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: CARD_BG,
    borderRadius: 20,
    padding: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: TITLE_COLOR,
    marginBottom: 8,
  },
  modalCategoriaLabel: {
    fontSize: 13,
    color: SUBTITLE_COLOR,
    marginBottom: 16,
  },
  modalLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: TITLE_COLOR,
    marginBottom: 6,
    marginTop: 12,
  },
  modalInput: {
    backgroundColor: INPUT_BG,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: TITLE_COLOR,
  },
  modalCategoriaRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 8,
    marginBottom: 8,
  },
  modalCategoriaBtn: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 10,
    backgroundColor: INPUT_BG,
    alignItems: "center",
  },
  modalCategoriaBtnActive: {
    backgroundColor: BUTTON_BG,
  },
  modalCategoriaBtnText: {
    fontSize: 11,
    fontWeight: "600",
    color: SUBTITLE_COLOR,
  },
  modalCategoriaBtnTextActive: {
    color: "#ffffff",
  },
  modalButtons: {
    flexDirection: "row",
    gap: 12,
    marginTop: 24,
  },
  modalBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  modalBtnCancel: {
    backgroundColor: INPUT_BG,
  },
  modalBtnSave: {
    backgroundColor: BUTTON_BG,
  },
  modalBtnDisabled: {
    opacity: 0.7,
  },
  modalBtnCancelText: {
    fontSize: 15,
    fontWeight: "600",
    color: SUBTITLE_COLOR,
  },
  modalBtnSaveText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#ffffff",
  },
});
