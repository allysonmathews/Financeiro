import { LinearGradient } from "expo-linear-gradient";
import { ArrowLeft, FileDown } from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BarChart, PieChart } from "react-native-chart-kit";
import { supabase } from "../../../services/supabase";

const GRADIENT_COLORS = ["#001A3D", "#002244", "#0a2744", "#133052", "#1e3a5f"] as const;
const FRANQUIA_ID = "CVF";
const AZUL_ATLAS = "#001A3D";
const VERDE_BILU = "#15803d";
const MESES_SHORT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

interface FechamentoDados {
  pctParticipacao?: number;
  faturamentoBruto: number;
  linhasPadrao?: Array<{ fornecedor: string; valorOriginal: number; valorRateado: number }>;
  linhasEsporadico?: Array<{ fornecedor: string; valorOriginal: number; valorRateado: number }>;
  linhasVariavel?: Array<{ fornecedor: string; valorUnit: number; qty: number; valorTotal: number; isBoleto: boolean }>;
  totalPadraoRateado?: number;
  totalEsporadicoRateado?: number;
  totalVariavel?: number;
  totalGastos?: number;
  lucroLiquido?: number;
  pctFranqueado?: number;
  valorFranqueado?: number;
  gastosPadrao?: Array<{ fornecedor: string; valor: number }>;
  gastosVariavel?: Array<{ fornecedor: string; valor: number }>;
  quantidadesVariavel?: number[];
  totalPadrao?: number;
  totalVariavel?: number;
  gastosEsporadicosValor?: number;
  pctFranquia?: number;
}

function formatarValor(v: number) {
  return "R$ " + v.toFixed(2).replace(".", ",");
}

function parsePayload(raw: unknown): FechamentoDados | null {
  if (raw == null) return null;
  return typeof raw === "string" ? (JSON.parse(raw) as FechamentoDados) : (raw as FechamentoDados);
}

const chartConfig = {
  backgroundColor: "#ffffff",
  backgroundGradientFrom: "#ffffff",
  backgroundGradientTo: "#f8fafc",
  decimalPlaces: 0,
  color: (opacity = 1) => `rgba(0, 26, 61, ${opacity})`,
  labelColor: () => "#64748b",
};

export default function CVFScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const anoAtual = new Date().getFullYear();
  const mesAtual = new Date().getMonth() + 1;
  const [mes, setMes] = useState(mesAtual);
  const [ano, setAno] = useState(anoAtual);
  const [fechamento, setFechamento] = useState<FechamentoDados | null>(null);
  const [historico, setHistorico] = useState<Array<{ mes: number; ano: number; dados: FechamentoDados }>>([]);
  const [loading, setLoading] = useState(true);
  const [modalMes, setModalMes] = useState(false);
  const [modalAno, setModalAno] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    const mesNum = parseInt(String(mes), 10);
    const anoNum = parseInt(String(ano), 10);
    try {
      const { data, error } = await supabase
        .from("fechamentos_mensais")
        .select("dados_fechamento")
        .eq("franquia_id", FRANQUIA_ID)
        .eq("mes_referencia", mesNum)
        .eq("ano_referencia", anoNum)
        .maybeSingle();
      if (error) throw error;
      const payload = parsePayload(data?.dados_fechamento);
      setFechamento(payload);
    } catch {
      setFechamento(null);
    } finally {
      setLoading(false);
    }
  }, [mes, ano]);

  const carregarHistorico = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("fechamentos_mensais")
        .select("mes_referencia, ano_referencia, dados_fechamento")
        .eq("franquia_id", FRANQUIA_ID)
        .order("ano_referencia", { ascending: true })
        .order("mes_referencia", { ascending: true });
      if (error) throw error;
      const rows = (data ?? []) as Array<{ mes_referencia: number; ano_referencia: number; dados_fechamento: unknown }>;
      const hoje = anoAtual * 12 + mesAtual;
      const dozeMesesAtras = hoje - 11;
      const list = rows
        .map((r) => {
          const d = parsePayload(r.dados_fechamento);
          if (!d) return null;
          const key = r.ano_referencia * 12 + r.mes_referencia;
          if (key < dozeMesesAtras) return null;
          return { mes: r.mes_referencia, ano: r.ano_referencia, dados: d };
        })
        .filter((x): x is NonNullable<typeof x> => x != null)
        .slice(-12);
      setHistorico(list);
    } catch {
      setHistorico([]);
    }
  }, [anoAtual, mesAtual]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  useEffect(() => {
    carregarHistorico();
  }, [carregarHistorico]);

  const anos = [anoAtual, anoAtual - 1, anoAtual - 2];
  const totalGastos = fechamento?.totalGastos ?? (fechamento ? (fechamento.totalPadrao ?? 0) + (fechamento.totalVariavel ?? 0) + (fechamento.gastosEsporadicosValor ?? 0) : 0);
  const lucroLiquido = fechamento?.lucroLiquido ?? (fechamento ? fechamento.faturamentoBruto - totalGastos : 0);
  const valorFranquia = fechamento?.valorFranqueado ?? (fechamento?.pctFranquia != null ? (lucroLiquido * fechamento.pctFranquia) / 100 : 0);
  const pctFranqueado = fechamento?.pctFranqueado ?? fechamento?.pctFranquia ?? 50;
  const linhasP = fechamento?.linhasPadrao ?? [];
  const linhasE = fechamento?.linhasEsporadico ?? [];
  const linhasV = fechamento?.linhasVariavel ?? [];
  const usaNovoFormato = linhasP.length > 0 || linhasE.length > 0 || linhasV.length > 0;

  const faturamentoAtual = fechamento?.faturamentoBruto ?? 0;
  const margemLiquida = faturamentoAtual > 0 ? (lucroLiquido / faturamentoAtual) * 100 : 0;
  const mesAnteriorRef = useMemo(() => {
    const prevMes = mes === 1 ? 12 : mes - 1;
    const prevAno = mes === 1 ? ano - 1 : ano;
    return historico.find((h) => h.mes === prevMes && h.ano === prevAno);
  }, [historico, mes, ano]);
  const faturamentoAnterior = mesAnteriorRef?.dados.faturamentoBruto ?? 0;
  const evolucaoPct = faturamentoAnterior > 0 ? ((faturamentoAtual - faturamentoAnterior) / faturamentoAnterior) * 100 : null;

  const chartWidth = Dimensions.get("window").width - 80;
  const chartHeight = 200;

  const dadosEvolucao = useMemo(() => {
    if (historico.length === 0) return { labels: [] as string[], faturamento: [] as number[], lucro: [] as number[] };
    const labels = historico.map((h) => MESES_SHORT[h.mes - 1] + " " + String(h.ano).slice(-2));
    const faturamento = historico.map((h) => h.dados.faturamentoBruto ?? 0);
    const lucro = historico.map((h) => h.dados.lucroLiquido ?? (h.dados.faturamentoBruto ?? 0) - (h.dados.totalGastos ?? 0));
    return { labels, faturamento, lucro };
  }, [historico]);

  const dadosPizza = useMemo(() => {
    if (!fechamento || totalGastos <= 0) return [];
    const padrao = fechamento.totalPadraoRateado ?? 0;
    const esporadico = fechamento.totalEsporadicoRateado ?? 0;
    const linhasVariavel = fechamento.linhasVariavel ?? [];
    const boletos = linhasVariavel.filter((l) => l.isBoleto).reduce((s, l) => s + l.valorTotal, 0);
    const variaveis = linhasVariavel.filter((l) => !l.isBoleto).reduce((s, l) => s + l.valorTotal, 0);
    const items: Array<{ name: string; total: number; color: string }> = [];
    if (padrao > 0) items.push({ name: "Padrão", total: padrao, color: AZUL_ATLAS });
    if (boletos > 0) items.push({ name: "Boletos", total: boletos, color: "#1e3a5f" });
    if (variaveis > 0) items.push({ name: "Variáveis", total: variaveis, color: "#64748b" });
    if (esporadico > 0) items.push({ name: "Esporádicos", total: esporadico, color: "#94a3b8" });
    return items;
  }, [fechamento, totalGastos]);

  const handleGerarPdf = useCallback(() => {
    Alert.alert(
      "Relatório Anual (PDF)",
      "A exportação em PDF será disponibilizada em breve. Por enquanto, use os gráficos e a planilha na tela para acompanhamento.",
      [{ text: "OK" }]
    );
  }, []);

  const temDadosMes = fechamento != null;

  return (
    <View style={styles.root}>
      <LinearGradient colors={[...GRADIENT_COLORS]} style={StyleSheet.absoluteFill} />
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable style={styles.backButton} onPress={() => router.back()} accessibilityLabel="Voltar">
          <ArrowLeft size={24} color="#ffffff" strokeWidth={2} />
        </Pressable>
        <Text style={styles.headerTitle}>CVF</Text>
        <Pressable style={styles.pdfButton} onPress={handleGerarPdf} accessibilityLabel="Gerar relatório PDF">
          <FileDown size={22} color="#ffffff" strokeWidth={2} />
        </Pressable>
      </View>
      <Text style={styles.subtitle}>Dashboard · Franquia CVF</Text>

      <View style={styles.selectors}>
        <Pressable style={styles.selector} onPress={() => setModalMes(true)}>
          <Text style={styles.selectorLabel}>Mês</Text>
          <Text style={styles.selectorValue}>{MESES[mes - 1]}</Text>
        </Pressable>
        <Pressable style={styles.selector} onPress={() => setModalAno(true)}>
          <Text style={styles.selectorLabel}>Ano</Text>
          <Text style={styles.selectorValue}>{ano}</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.centerWrap}>
          <ActivityIndicator size="large" color="#ffffff" />
          <Text style={styles.loadingText}>Carregando...</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
          showsVerticalScrollIndicator={false}
        >
          {temDadosMes && (
            <View style={styles.kpiRow}>
              <View style={styles.kpiCard}>
                <Text style={styles.kpiLabel}>Faturamento</Text>
                <Text style={styles.kpiValue}>{formatarValor(faturamentoAtual)}</Text>
              </View>
              <View style={styles.kpiCard}>
                <Text style={styles.kpiLabel}>Margem Líquida</Text>
                <Text style={[styles.kpiValue, styles.kpiValueGreen]}>{margemLiquida.toFixed(1)}%</Text>
              </View>
              <View style={styles.kpiCard}>
                <Text style={styles.kpiLabel}>Evolução</Text>
                <Text style={[styles.kpiValue, evolucaoPct != null && evolucaoPct >= 0 ? styles.kpiValueGreen : styles.kpiValueRed]}>
                  {evolucaoPct != null ? evolucaoPct.toFixed(1) + "%" : "—"}
                </Text>
              </View>
            </View>
          )}

          <View style={styles.chartCard}>
            <Text style={styles.chartCardTitle}>Evolução · Últimos 12 meses</Text>
            {dadosEvolucao.labels.length > 0 ? (
              <BarChart
                data={{
                  labels: dadosEvolucao.labels,
                  datasets: [
                    { data: dadosEvolucao.faturamento, color: () => AZUL_ATLAS },
                    { data: dadosEvolucao.lucro, color: () => VERDE_BILU },
                  ],
                }}
                width={chartWidth}
                height={chartHeight}
                chartConfig={{ ...chartConfig, barPercentage: 0.5 }}
                style={styles.barChart}
                fromZero
                showBarTops={false}
                withInnerLines
              />
            ) : (
              <View style={styles.chartEmpty}>
                <Text style={styles.chartEmptyText}>Nenhum dado dos últimos 12 meses.</Text>
                <Text style={styles.chartEmptySubtext}>Realize fechamentos no chat para ver a evolução aqui.</Text>
              </View>
            )}
          </View>

          <View style={styles.chartCard}>
            <Text style={styles.chartCardTitle}>Distribuição de despesas · {MESES[mes - 1]}/{ano}</Text>
            {dadosPizza.length > 0 ? (
              <PieChart
                data={dadosPizza}
                width={chartWidth}
                height={200}
                chartConfig={{
                  ...chartConfig,
                  color: (_, i) => dadosPizza[i % dadosPizza.length]?.color ?? AZUL_ATLAS,
                }}
                accessor="total"
                backgroundColor="transparent"
                paddingLeft="0"
                absolute
                style={styles.pieChart}
              />
            ) : (
              <View style={styles.chartEmpty}>
                <Text style={styles.chartEmptyText}>Sem despesas para este período.</Text>
                <Text style={styles.chartEmptySubtext}>Confira a planilha abaixo após um fechamento.</Text>
              </View>
            )}
          </View>

          {!fechamento ? (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyText}>Nenhum fechamento realizado para este período.</Text>
              <Text style={styles.emptySubtext}>Use o chat na Home com "Fechamento CVF [mês] [ano]" para gerar.</Text>
            </View>
          ) : (
            <View style={styles.sheet}>
              <View style={styles.sheetHeader}>
                <Text style={styles.sheetTitle}>Planilha de Fechamento</Text>
                <Text style={styles.sheetPeriod}>{MESES[mes - 1]} / {ano}</Text>
              </View>
              <View style={styles.table}>
                <View style={styles.tableRowHeader}>
                  <Text style={[styles.tableCell, styles.tableCellDesc, styles.tableHeaderText]}>Descritivo</Text>
                  <Text style={[styles.tableCell, styles.tableCellNum, styles.tableHeaderText]}>{usaNovoFormato ? "Tipo" : "Valor un."}</Text>
                  {!usaNovoFormato && <Text style={[styles.tableCell, styles.tableCellNum, styles.tableHeaderText]}>Qtd</Text>}
                  <Text style={[styles.tableCell, styles.tableCellTotal, styles.tableHeaderText]}>Total</Text>
                </View>
                {usaNovoFormato ? (
                  <>
                    {linhasP.map((g, i) => (
                      <View key={`p-${i}`} style={[styles.tableRow, i % 2 === 1 && styles.tableRowAlt]}>
                        <Text style={[styles.tableCell, styles.tableCellDesc]} numberOfLines={1}>{g.fornecedor}</Text>
                        <Text style={[styles.tableCell, styles.tableCellNum]}>Rateado</Text>
                        <Text style={[styles.tableCell, styles.tableCellTotal]}>{formatarValor(g.valorRateado)}</Text>
                      </View>
                    ))}
                    {linhasE.map((g, i) => (
                      <View key={`e-${i}`} style={[styles.tableRow, styles.tableRowAlt]}>
                        <Text style={[styles.tableCell, styles.tableCellDesc]} numberOfLines={1}>{g.fornecedor}</Text>
                        <Text style={[styles.tableCell, styles.tableCellNum]}>Rateado</Text>
                        <Text style={[styles.tableCell, styles.tableCellTotal]}>{formatarValor(g.valorRateado)}</Text>
                      </View>
                    ))}
                    {linhasV.map((g, i) => (
                      <View key={`v-${i}`} style={[styles.tableRow, i % 2 === 1 && styles.tableRowAlt]}>
                        <Text style={[styles.tableCell, styles.tableCellDesc]} numberOfLines={1}>{g.fornecedor}</Text>
                        <Text style={[styles.tableCell, styles.tableCellNum]}>{g.isBoleto ? "Cheio" : "Rateado"}</Text>
                        <Text style={[styles.tableCell, styles.tableCellTotal]}>{formatarValor(g.valorTotal)}</Text>
                      </View>
                    ))}
                  </>
                ) : (
                  <>
                    {(fechamento.gastosPadrao ?? []).map((g, i) => (
                      <View key={`p-${i}`} style={[styles.tableRow, i % 2 === 1 && styles.tableRowAlt]}>
                        <Text style={[styles.tableCell, styles.tableCellDesc]} numberOfLines={1}>{g.fornecedor}</Text>
                        <Text style={[styles.tableCell, styles.tableCellNum]}>{formatarValor(g.valor)}</Text>
                        <Text style={[styles.tableCell, styles.tableCellNum]}>1</Text>
                        <Text style={[styles.tableCell, styles.tableCellTotal]}>{formatarValor(g.valor)}</Text>
                      </View>
                    ))}
                    {(fechamento.gastosVariavel ?? []).map((g, i) => (
                      <View key={`v-${i}`} style={[styles.tableRow, styles.tableRowAlt]}>
                        <Text style={[styles.tableCell, styles.tableCellDesc]} numberOfLines={1}>{g.fornecedor}</Text>
                        <Text style={[styles.tableCell, styles.tableCellNum]}>{formatarValor(g.valor)}</Text>
                        <Text style={[styles.tableCell, styles.tableCellNum]}>{fechamento.quantidadesVariavel?.[i] ?? 0}</Text>
                        <Text style={[styles.tableCell, styles.tableCellTotal]}>{formatarValor(g.valor * (fechamento.quantidadesVariavel?.[i] ?? 0))}</Text>
                      </View>
                    ))}
                    {(fechamento.gastosEsporadicosValor ?? 0) > 0 && (
                      <View style={[styles.tableRow, styles.tableRowAlt]}>
                        <Text style={[styles.tableCell, styles.tableCellDesc]}>Gastos esporádicos</Text>
                        <Text style={[styles.tableCell, styles.tableCellNum]}>–</Text>
                        <Text style={[styles.tableCell, styles.tableCellNum]}>–</Text>
                        <Text style={[styles.tableCell, styles.tableCellTotal]}>{formatarValor(fechamento.gastosEsporadicosValor)}</Text>
                      </View>
                    )}
                  </>
                )}
                <View style={[styles.tableRow, styles.tableRowTotal]}>
                  <Text style={[styles.tableCell, styles.tableCellDesc]}>Total despesas</Text>
                  {usaNovoFormato ? <Text style={[styles.tableCell, styles.tableCellNum]}>–</Text> : <><Text style={[styles.tableCell, styles.tableCellNum]}>–</Text><Text style={[styles.tableCell, styles.tableCellNum]}>–</Text></>}
                  <Text style={[styles.tableCell, styles.tableCellTotal]}>{formatarValor(totalGastos)}</Text>
                </View>
                <View style={[styles.tableRow, styles.tableRowRevenue]}>
                  <Text style={[styles.tableCell, styles.tableCellDesc]}>Faturamento bruto</Text>
                  {usaNovoFormato ? <Text style={[styles.tableCell, styles.tableCellNum]}>–</Text> : <><Text style={[styles.tableCell, styles.tableCellNum]}>–</Text><Text style={[styles.tableCell, styles.tableCellNum]}>–</Text></>}
                  <Text style={[styles.tableCell, styles.tableCellTotal]}>{formatarValor(fechamento.faturamentoBruto)}</Text>
                </View>
                <View style={[styles.tableRow, styles.tableRowProfit]}>
                  <Text style={[styles.tableCell, styles.tableCellDesc]}>Lucro líquido</Text>
                  {usaNovoFormato ? <Text style={[styles.tableCell, styles.tableCellNum]}>–</Text> : <><Text style={[styles.tableCell, styles.tableCellNum]}>–</Text><Text style={[styles.tableCell, styles.tableCellNum]}>–</Text></>}
                  <Text style={[styles.tableCell, styles.tableCellTotal]}>{formatarValor(lucroLiquido)}</Text>
                </View>
                <View style={[styles.tableRow, styles.tableRowFranquia]}>
                  <Text style={[styles.tableCell, styles.tableCellDesc]}>Franqueado ({pctFranqueado}%)</Text>
                  {usaNovoFormato ? <Text style={[styles.tableCell, styles.tableCellNum]}>–</Text> : <><Text style={[styles.tableCell, styles.tableCellNum]}>–</Text><Text style={[styles.tableCell, styles.tableCellNum]}>–</Text></>}
                  <Text style={[styles.tableCell, styles.tableCellTotal]}>{formatarValor(valorFranquia)}</Text>
                </View>
              </View>
            </View>
          )}
        </ScrollView>
      )}

      <Modal visible={modalMes} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setModalMes(false)}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Selecionar mês</Text>
            {MESES.map((nome, i) => (
              <Pressable key={nome} style={[styles.modalOption, mes === i + 1 && styles.modalOptionActive]} onPress={() => { setMes(i + 1); setModalMes(false); }}>
                <Text style={[styles.modalOptionText, mes === i + 1 && styles.modalOptionTextActive]}>{nome}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
      <Modal visible={modalAno} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setModalAno(false)}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Selecionar ano</Text>
            {anos.map((a) => (
              <Pressable key={a} style={[styles.modalOption, ano === a && styles.modalOptionActive]} onPress={() => { setAno(a); setModalAno(false); }}>
                <Text style={[styles.modalOptionText, ano === a && styles.modalOptionTextActive]}>{a}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: AZUL_ATLAS },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 8 },
  backButton: { padding: 8, marginRight: 8 },
  headerTitle: { flex: 1, fontSize: 20, fontWeight: "600", color: "#ffffff" },
  pdfButton: { padding: 8 },
  subtitle: { fontSize: 14, color: "rgba(255,255,255,0.8)", paddingHorizontal: 16, marginBottom: 16 },
  selectors: { flexDirection: "row", gap: 12, paddingHorizontal: 16, marginBottom: 16 },
  selector: { flex: 1, backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14 },
  selectorLabel: { fontSize: 11, color: "rgba(255,255,255,0.7)", marginBottom: 2 },
  selectorValue: { fontSize: 16, fontWeight: "600", color: "#ffffff" },
  centerWrap: { flex: 1, justifyContent: "center", alignItems: "center" },
  loadingText: { marginTop: 8, fontSize: 14, color: "#94a3b8" },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16 },
  kpiRow: { flexDirection: "row", gap: 10, marginBottom: 16 },
  kpiCard: {
    flex: 1,
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  kpiLabel: { fontSize: 11, color: "#64748b", marginBottom: 4 },
  kpiValue: { fontSize: 14, fontWeight: "700", color: AZUL_ATLAS },
  kpiValueGreen: { color: VERDE_BILU },
  kpiValueRed: { color: "#dc2626" },
  chartCard: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  chartCardTitle: { fontSize: 14, fontWeight: "700", color: AZUL_ATLAS, marginBottom: 12 },
  barChart: { borderRadius: 8 },
  pieChart: { borderRadius: 8 },
  chartEmpty: { minHeight: 160, justifyContent: "center", alignItems: "center", paddingVertical: 24 },
  chartEmptyText: { fontSize: 15, color: "#64748b", marginBottom: 4 },
  chartEmptySubtext: { fontSize: 13, color: "#94a3b8" },
  emptyWrap: { paddingVertical: 32, paddingHorizontal: 24, alignItems: "center" },
  emptyText: { fontSize: 16, color: "#e2e8f0", textAlign: "center" },
  emptySubtext: { fontSize: 13, color: "#94a3b8", marginTop: 8, textAlign: "center" },
  sheet: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  sheetHeader: {
    backgroundColor: "#f8fafc",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  sheetTitle: { fontSize: 16, fontWeight: "700", color: AZUL_ATLAS },
  sheetPeriod: { fontSize: 13, color: "#64748b", marginTop: 2 },
  table: { borderWidth: 1, borderColor: "#e2e8f0", borderTopWidth: 0 },
  tableRowHeader: { flexDirection: "row", backgroundColor: AZUL_ATLAS, paddingVertical: 10, paddingHorizontal: 10 },
  tableRow: { flexDirection: "row", paddingVertical: 10, paddingHorizontal: 10, backgroundColor: "#ffffff", borderTopWidth: 1, borderTopColor: "#f1f5f9" },
  tableRowAlt: { backgroundColor: "#f8fafc" },
  tableRowTotal: { backgroundColor: "#f1f5f9", borderTopWidth: 2, borderTopColor: "#e2e8f0" },
  tableRowRevenue: { backgroundColor: "#ecfdf5" },
  tableRowProfit: { backgroundColor: "#d1fae5" },
  tableRowFranquia: { backgroundColor: "#a7f3d0", borderTopWidth: 2, borderTopColor: AZUL_ATLAS },
  tableCell: { fontSize: 13, color: "#1e293b" },
  tableCellDesc: { flex: 1.2, minWidth: 0 },
  tableCellNum: { width: 70, textAlign: "right" },
  tableCellTotal: { width: 80, textAlign: "right", fontWeight: "600" },
  tableHeaderText: { color: "#ffffff", fontWeight: "700" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: 24 },
  modalBox: { width: "100%", maxWidth: 320, maxHeight: "80%", backgroundColor: "#ffffff", borderRadius: 16, padding: 16 },
  modalTitle: { fontSize: 16, fontWeight: "700", color: AZUL_ATLAS, marginBottom: 12 },
  modalOption: { paddingVertical: 14, paddingHorizontal: 12, borderRadius: 10, marginBottom: 4 },
  modalOptionActive: { backgroundColor: AZUL_ATLAS },
  modalOptionText: { fontSize: 15, color: "#1e293b" },
  modalOptionTextActive: { color: "#ffffff", fontWeight: "600" },
});
