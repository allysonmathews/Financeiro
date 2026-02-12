import { LinearGradient } from "expo-linear-gradient";
import {
  Building2,
  Menu,
  Send,
  Settings,
  Store,
  User,
} from "lucide-react-native";
import React, { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
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
import { enviarMensagem, type LancamentoExtraido } from "../services/groq";
import { supabase } from "../services/supabase";

const GRADIENT_COLORS = ["#001A3D", "#002244", "#0a2744", "#133052", "#1e3a5f"] as const;
const CARD_BG = "#ffffff";
const TITLE_COLOR = "#001A3D";
const SUBTITLE_COLOR = "#64748b";
const ICON_BG = "#f1f5f9";
const ICON_COLOR = "#001A3D";
const CHAT_BUTTON_BG = "#001A3D";
const INPUT_PLACEHOLDER = "#64748b";

const CARDS = [
  { id: "atlas", title: "Atlas", icon: Building2, description: "Gestão empresarial" },
  { id: "franquias", title: "Franquias", icon: Store, description: "Rede e franquias" },
  { id: "pessoal", title: "Pessoal", icon: User, description: "Finanças pessoais" },
] as const;

const MENU_ITEMS = [
  ...CARDS,
  { id: "ajustes", title: "Ajustes", icon: Settings, description: "Gastos fixos e configurações" },
] as const;

type FechamentoStep =
  | "idle"
  | "carregando"
  | "aguardar_pct_participacao"
  | "aguardar_faturamento"
  | "aguardar_variavel"
  | "aguardar_esporadico_sn"
  | "aguardar_esporadico_desc"
  | "aguardar_esporadico_valor"
  | "planilha";

interface GastoFixoRow {
  id: string;
  fornecedor: string;
  valor: number;
  categoria: string;
}

function isBoleto(fornecedor: string): boolean {
  return (fornecedor || "").toLowerCase().includes("boleto");
}

interface FechamentoData {
  gastosPadrao: Array<{ fornecedor: string; valor: number }>;
  gastosVariavel: Array<{ fornecedor: string; valor: number }>;
  pctParticipacao: number;
  faturamentoBruto: number;
  quantidadesVariavel: number[];
  gastosEsporadicoManual?: Array<{ descricao: string; valor: number }>;
  esporadicoTempDesc?: string;
  totalPadraoRateado?: number;
  totalEsporadicoRateado?: number;
  totalVariavel?: number;
  totalGastos?: number;
  lucroLiquido?: number;
  pctFranqueado?: number;
  valorFranqueado?: number;
  linhasPadrao?: Array<{ fornecedor: string; valorOriginal: number; valorRateado: number }>;
  linhasEsporadico?: Array<{ fornecedor: string; valorOriginal: number; valorRateado: number }>;
  linhasVariavel?: Array<{ fornecedor: string; valorUnit: number; qty: number; valorTotal: number; isBoleto: boolean }>;
}

type ChatMessageItem =
  | { id: string; type: "user"; content: string }
  | { id: string; type: "assistant"; content: string }
  | {
      id: string;
      type: "lancamento";
      content: string;
      lancamento: LancamentoExtraido;
      status: "pending" | "confirmed" | "cancelled";
    }
  | {
      id: string;
      type: "planilha";
      content: string;
      data: FechamentoData;
      status?: "pending_confirmation" | "confirmed";
      fechamentoContexto?: { franquia: string; mes: number; ano: number };
    };

function formatarValor(v: number) {
  return "R$ " + v.toFixed(2).replace(".", ",");
}

function gerarIdUnico(): string {
  return Date.now().toString() + Math.random().toString(36).slice(2);
}

function calcularPlanilha(
  base: FechamentoData,
  franquia: string
): FechamentoData {
  const pct = base.pctParticipacao / 100;
  const linhasPadrao = base.gastosPadrao.map((g) => ({
    fornecedor: g.fornecedor,
    valorOriginal: g.valor,
    valorRateado: g.valor * pct,
  }));
  const totalPadraoRateado = linhasPadrao.reduce((s, l) => s + l.valorRateado, 0);

  const linhasVariavel = base.gastosVariavel.map((g, i) => {
    const q = base.quantidadesVariavel[i] ?? 0;
    const valorBruto = g.valor * q;
    const isBoletoItem = isBoleto(g.fornecedor);
    const valorTotal = isBoletoItem ? valorBruto : valorBruto * pct;
    return {
      fornecedor: g.fornecedor,
      valorUnit: g.valor,
      qty: q,
      valorTotal,
      isBoleto: isBoletoItem,
    };
  });
  const totalVariavel = linhasVariavel.reduce((s, l) => s + l.valorTotal, 0);

  const gastosEsporadicoManual = base.gastosEsporadicoManual ?? [];
  const linhasEsporadico = gastosEsporadicoManual.map((e) => ({
    fornecedor: e.descricao,
    valorOriginal: e.valor,
    valorRateado: e.valor,
  }));
  const totalEsporadicoRateado = linhasEsporadico.reduce((s, l) => s + l.valorRateado, 0);

  const totalGastos = totalPadraoRateado + totalEsporadicoRateado + totalVariavel;
  const lucroLiquido = base.faturamentoBruto - totalGastos;
  const pctFranqueado = franquia === "cvt" ? 40 : 50;
  const valorFranqueado = (lucroLiquido * pctFranqueado) / 100;

  return {
    ...base,
    linhasPadrao,
    linhasEsporadico,
    linhasVariavel,
    totalPadraoRateado,
    totalEsporadicoRateado,
    totalVariavel,
    totalGastos,
    lucroLiquido,
    pctFranqueado,
    valorFranqueado,
  };
}

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [chatInput, setChatInput] = useState("");
  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingLancamentoId, setSavingLancamentoId] = useState<string | null>(null);
  const [savingFechamentoId, setSavingFechamentoId] = useState<string | null>(null);
  const [menuVisible, setMenuVisible] = useState(false);
  const [fechamentoStep, setFechamentoStep] = useState<FechamentoStep>("idle");
  const [fechamentoData, setFechamentoData] = useState<FechamentoData | null>(null);
  const [fechamentoContexto, setFechamentoContexto] = useState<{
    franquia: string;
    mes: number;
    ano: number;
  } | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const fechamentoContextoRef = useRef<{ franquia: string; mes: number; ano: number } | null>(null);
  const messagesRef = useRef<ChatMessageItem[]>([]);
  messagesRef.current = messages;

  const REGEX_FECHAMENTO = /^\s*fechamento\s+(cvt|cvf)\s+(\d{1,2})\s+(\d{4})\s*$/i;
  const extrairContextoDaMensagem = useCallback((content: string): { franquia: string; mes: number; ano: number } | null => {
    const match = content.match(REGEX_FECHAMENTO);
    if (!match) return null;
    const mes = Math.max(1, Math.min(12, parseInt(match[2], 10)));
    const ano = parseInt(match[3], 10);
    if (ano < 2000 || ano > 2100) return null;
    return { franquia: match[1].toLowerCase(), mes, ano };
  }, []);

  const getContextoPersistente = useCallback((): { franquia: string; mes: number; ano: number } | null => {
    if (fechamentoContextoRef.current) return fechamentoContextoRef.current;
    if (fechamentoContexto) return fechamentoContexto;
    const list = messagesRef.current;
    for (let i = 0; i < list.length; i++) {
      const m = list[i];
      if (m.type === "user") {
        const ctx = extrairContextoDaMensagem(m.content);
        if (ctx) return ctx;
      }
    }
    return null;
  }, [fechamentoContexto]);

  const scrollToEnd = useCallback(() => {
    setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }, []);

  const handleCardPress = (id: string) => {
    if (id === "pessoal") {
      router.push("/pessoal");
      return;
    }
    if (id === "franquias") {
      router.push("/franquias");
      return;
    }
    if (id === "ajustes") {
      router.push("/ajustes");
      return;
    }
    console.log("Card pressionado:", id);
  };

  const openMenu = () => setMenuVisible(true);
  const closeMenu = () => setMenuVisible(false);
  const handleMenuItemPress = (id: string) => {
    closeMenu();
    handleCardPress(id);
  };

  const updateLancamentoStatus = useCallback(
    (id: string, status: "confirmed" | "cancelled") => {
      setMessages((prev) =>
        prev.map((m) =>
          m.type === "lancamento" && m.id === id ? { ...m, status } : m
        )
      );
    },
    []
  );

  const addAssistantMessage = useCallback((content: string) => {
    const msg: ChatMessageItem = {
      id: "a-" + gerarIdUnico(),
      type: "assistant",
      content,
    };
    setMessages((prev) => [...prev, msg]);
    scrollToEnd();
  }, [scrollToEnd]);

  const runFechamentoFlow = useCallback(
    async (contexto: { franquia: string; mes: number; ano: number } | null) => {
      fechamentoContextoRef.current = contexto;
      setFechamentoContexto(contexto);
      setFechamentoStep("carregando");
      addAssistantMessage("Carregando gastos...");
      scrollToEnd();
      try {
        const { data: padraoData, error: errPadrao } = await supabase
          .from("gastos_fixos_padrao")
          .select("id, fornecedor, valor, categoria")
          .in("categoria", ["padrao"]);
        if (errPadrao) throw errPadrao;
        const rowsPadrao = (padraoData as GastoFixoRow[]) ?? [];
        const padrao = rowsPadrao.map((r) => ({ fornecedor: r.fornecedor, valor: Number(r.valor) }));

        let variavel: Array<{ fornecedor: string; valor: number }> = [];
        const { data: varData, error: errVar } = await supabase
          .from("gastos_padrao_variavel")
          .select("id, fornecedor, valor");
        if (!errVar && varData?.length) {
          variavel = (varData as Array<{ fornecedor?: string; valor: number }>).map((r) => ({
            fornecedor: r.fornecedor ?? "Item",
            valor: Number(r.valor ?? 0),
          }));
        } else {
          const { data: fixosVar } = await supabase
            .from("gastos_fixos_padrao")
            .select("id, fornecedor, valor, categoria")
            .eq("categoria", "variavel");
          const rowsVar = (fixosVar as GastoFixoRow[]) ?? [];
          variavel = rowsVar.map((r) => ({ fornecedor: r.fornecedor, valor: Number(r.valor) }));
        }

        const dataFechamento: FechamentoData = {
          gastosPadrao: padrao,
          gastosVariavel: variavel,
          pctParticipacao: 0,
          faturamentoBruto: 0,
          quantidadesVariavel: [],
        };
        setFechamentoData(dataFechamento);
        setFechamentoStep("aguardar_pct_participacao");
        addAssistantMessage("% de Participação?");
      } catch (e) {
        fechamentoContextoRef.current = null;
        setFechamentoStep("idle");
        setFechamentoContexto(null);
        addAssistantMessage("Erro ao carregar gastos. Verifique as tabelas gastos_fixos_padrao e gastos_padrao_variavel.");
      }
    },
    [addAssistantMessage, scrollToEnd]
  );

  const startFechamento = useCallback(() => {
    runFechamentoFlow(null);
  }, [runFechamentoFlow]);

  const startFechamentoComContexto = useCallback(
    (franquia: string, mes: number, ano: number) => {
      runFechamentoFlow({ franquia: franquia.toLowerCase(), mes, ano });
    },
    [runFechamentoFlow]
  );

  /** Se o texto contém "Fechamento", inicia o fluxo de fechamento (com ou sem franquia/mês/ano). */
  const iniciarFechamentoFranquia = useCallback(
    (texto: string) => {
      const match = texto.match(/^\s*fechamento\s+(cvt|cvf)\s+(\d{1,2})\s+(\d{4})\s*$/i);
      if (match) {
        const franquia = match[1].toLowerCase();
        const mes = Math.max(1, Math.min(12, parseInt(match[2], 10)));
        const ano = parseInt(match[3], 10);
        if (ano >= 2000 && ano <= 2100) {
          fechamentoContextoRef.current = { franquia, mes, ano };
          setFechamentoContexto({ franquia, mes, ano });
          startFechamentoComContexto(franquia, mes, ano);
          return;
        }
      }
      startFechamento();
    },
    [startFechamentoComContexto, startFechamento]
  );

  const handleConfirmarLancamento = useCallback(
    async (msg: ChatMessageItem & { type: "lancamento"; lancamento: LancamentoExtraido }) => {
      if (msg.type !== "lancamento" || msg.status !== "pending") return;
      setSavingLancamentoId(msg.id);
      try {
        const { error } = await supabase.from("lancamentos").insert({
          valor: msg.lancamento.valor,
          descricao: msg.lancamento.descricao,
          quem_pagou: msg.lancamento.quemPagou,
          tipo_caixa: msg.lancamento.tipoCaixa,
        });
        if (error) throw error;
        updateLancamentoStatus(msg.id, "confirmed");
        addAssistantMessage("Lançamento gravado no banco com sucesso.");
        if (Platform.OS !== "web") {
          Alert.alert("Sucesso", "Lançamento gravado no banco.");
        }
      } catch (e) {
        const mensagemErro =
          e instanceof Error ? e.message : "Erro ao salvar. Tente novamente.";
        addAssistantMessage("Erro: " + mensagemErro);
        if (Platform.OS !== "web") {
          Alert.alert("Erro", mensagemErro);
        }
      } finally {
        setSavingLancamentoId(null);
      }
    },
    [updateLancamentoStatus, addAssistantMessage]
  );

  const handleConfirmarFechamento = useCallback(
    async (msg: ChatMessageItem & { type: "planilha"; data: FechamentoData; fechamentoContexto?: { franquia: string; mes: number; ano: number } }) => {
      if (msg.type !== "planilha" || msg.status === "confirmed") return;
      const ctx = msg.fechamentoContexto ?? getContextoPersistente();
      if (!ctx) {
        addAssistantMessage("Não foi possível obter franquia/mês/ano. Inicie com: Fechamento CVT 02 2025");
        return;
      }
      setSavingFechamentoId(msg.id);
      const next = msg.data;
      try {
        const payload = {
          franquia_id: ctx.franquia.toUpperCase(),
          mes_referencia: ctx.mes,
          ano_referencia: ctx.ano,
          dados_fechamento: {
            pctParticipacao: next.pctParticipacao,
            faturamentoBruto: next.faturamentoBruto,
            linhasPadrao: next.linhasPadrao,
            linhasEsporadico: next.linhasEsporadico,
            linhasVariavel: next.linhasVariavel ?? [],
            totalPadraoRateado: next.totalPadraoRateado,
            totalEsporadicoRateado: next.totalEsporadicoRateado,
            totalVariavel: next.totalVariavel ?? 0,
            totalGastos: next.totalGastos,
            lucroLiquido: next.lucroLiquido,
            pctFranqueado: next.pctFranqueado,
            valorFranqueado: next.valorFranqueado,
          },
        };
        const { error: errFechamento } = await supabase
          .from("fechamentos_mensais")
          .upsert(payload, { onConflict: "franquia_id,mes_referencia,ano_referencia" });
        if (errFechamento) throw errFechamento;

        const descricaoLancamento =
          "Pagamento Fechamento " +
          ctx.franquia.toUpperCase() +
          " - " +
          String(ctx.mes).padStart(2, "0") +
          "/" +
          ctx.ano;
        const valorFranqueado = next.valorFranqueado ?? 0;
        const { error: errLancamento } = await supabase.from("lancamentos").insert({
          valor: valorFranqueado,
          descricao: descricaoLancamento,
          quem_pagou: "Gabriel",
          tipo_caixa: "Pessoal",
        });
        if (errLancamento) throw errLancamento;

        setMessages((prev) =>
          prev.map((m) =>
            m.type === "planilha" && m.id === msg.id ? { ...m, status: "confirmed" as const } : m
          )
        );
        fechamentoContextoRef.current = null;
        setFechamentoContexto(null);
        addAssistantMessage("Fechamento registrado e lançamento financeiro enviado para o Pessoal!");
        scrollToEnd();
      } catch (e) {
        const mensagemErro = e instanceof Error ? e.message : "Erro ao salvar. Tente novamente.";
        addAssistantMessage("Erro: " + mensagemErro);
      } finally {
        setSavingFechamentoId(null);
      }
    },
    [addAssistantMessage, scrollToEnd, getContextoPersistente]
  );

  const handleFechamentoReply = useCallback(
    (text: string) => {
      if (!fechamentoData) return;
      const addMsg = addAssistantMessage;

      const extrairNumero = (t: string): number | null => {
        const limpo = t.replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
        const match = limpo.match(/\d+\.?\d*/);
        return match ? parseFloat(match[0]) : null;
      };

      if (fechamentoStep === "aguardar_pct_participacao") {
        const pct = extrairNumero(text);
        if (pct === null || pct < 0 || pct > 100) {
          addMsg("Informe a porcentagem de participação (0 a 100). Ex: 25,77");
          return;
        }
        setFechamentoData((prev) => (prev ? { ...prev, pctParticipacao: pct } : null));
        setFechamentoStep("aguardar_faturamento");
        addMsg("Faturamento Bruto?");
        return;
      }

      if (fechamentoStep === "aguardar_faturamento") {
        const num = extrairNumero(text);
        if (num === null || num < 0) {
          addMsg("Informe o faturamento bruto em reais (ex: 5000 ou R$ 5.000,00).");
          return;
        }
        const dataComFaturamento = { ...fechamentoData, faturamentoBruto: num };
        setFechamentoData(dataComFaturamento);
        if (fechamentoData.gastosVariavel.length > 0) {
          setFechamentoStep("aguardar_variavel");
          const primeiro = fechamentoData.gastosVariavel[0];
          addMsg("Qual a quantidade de " + primeiro.fornecedor + "?");
          return;
        }
        setFechamentoStep("aguardar_esporadico_sn");
        addMsg("Houve algum gasto esporádico este mês? (Sim/Não)");
        return;
      }

      if (fechamentoStep === "aguardar_variavel") {
        const num = extrairNumero(text);
        if (num === null || num < 0) {
          addMsg("Informe a quantidade (número). Ex: 0, 1, 2...");
          return;
        }
        const novasQty = [...fechamentoData.quantidadesVariavel, num];
        const dataComQty = { ...fechamentoData, quantidadesVariavel: novasQty };
        setFechamentoData(dataComQty);
        const nVar = fechamentoData.gastosVariavel.length;
        if (novasQty.length < nVar) {
          const proximo = fechamentoData.gastosVariavel[novasQty.length];
          addMsg("Qual a quantidade de " + proximo.fornecedor + "?");
          return;
        }
        setFechamentoStep("aguardar_esporadico_sn");
        addMsg("Houve algum gasto esporádico? (Sim/Não)");
        return;
      }

      if (fechamentoStep === "aguardar_esporadico_sn") {
        const resp = text.trim().toLowerCase();
        if (resp !== "sim" && resp !== "não" && resp !== "nao" && resp !== "s" && resp !== "n") {
          addMsg("Responda Sim ou Não.");
          return;
        }
        const querEsporadico = resp === "sim" || resp === "s";
        if (!querEsporadico) {
          const ctxLocked = getContextoPersistente();
          const franquia = ctxLocked?.franquia ?? "cvt";
          const next = calcularPlanilha(fechamentoData, franquia);
          setFechamentoData(next);
          setFechamentoStep("planilha");
          setMessages((m) => [
            ...m,
            {
              id: "p-" + gerarIdUnico(),
              type: "planilha",
              content: "Planilha de fechamento",
              data: next,
              status: "pending_confirmation",
              fechamentoContexto: ctxLocked ?? undefined,
            },
          ]);
          if (ctxLocked) {
            addMsg("Os valores estão corretos? Deseja salvar o fechamento e registrar o pagamento?");
          } else {
            addMsg("Planilha gerada. Como não foi informada franquia/mês/ano, não é possível salvar.");
          }
          return;
        }
        setFechamentoStep("aguardar_esporadico_desc");
        addMsg("Qual a descrição?");
        return;
      }

      if (fechamentoStep === "aguardar_esporadico_desc") {
        const desc = text.trim();
        if (!desc) {
          addMsg("Informe a descrição (ex: Manutenção equipamento).");
          return;
        }
        setFechamentoData((prev) => (prev ? { ...prev, esporadicoTempDesc: desc } : null));
        setFechamentoStep("aguardar_esporadico_valor");
        addMsg("Qual o valor (R$)?");
        return;
      }

      if (fechamentoStep === "aguardar_esporadico_valor") {
        const valor = extrairNumero(text);
        if (valor === null || valor < 0) {
          addMsg("Informe o valor em reais. Ex: 150,00");
          return;
        }
        const desc = fechamentoData.esporadicoTempDesc ?? "Gasto esporádico";
        const lista = fechamentoData.gastosEsporadicoManual ?? [];
        const novaLista = [...lista, { descricao: desc, valor }];
        const dataComEsporadico = {
          ...fechamentoData,
          gastosEsporadicoManual: novaLista,
          esporadicoTempDesc: undefined,
        };
        setFechamentoData(dataComEsporadico);
        setFechamentoStep("aguardar_esporadico_sn");
        addMsg("Deseja adicionar MAIS ALGUM gasto esporádico? (Sim/Não)");
      }
    },
    [fechamentoStep, fechamentoData, fechamentoContexto, addAssistantMessage, getContextoPersistente]
  );

  const handleSendMessage = useCallback(async () => {
    const text = chatInput.trim();
    if (!text || loading) return;

    if (text.toLowerCase().includes("fechamento")) {
      setChatInput("");
      const userMsg: ChatMessageItem = {
        id: "u-" + gerarIdUnico(),
        type: "user",
        content: text,
      };
      setMessages((prev) => [...prev, userMsg]);
      scrollToEnd();
      iniciarFechamentoFranquia(text);
      return;
    }

    setChatInput("");
    const userMsg: ChatMessageItem = {
      id: "u-" + gerarIdUnico(),
      type: "user",
      content: text,
    };
    setMessages((prev) => [...prev, userMsg]);
    scrollToEnd();

    if (fechamentoStep !== "idle" && fechamentoStep !== "planilha" && fechamentoStep !== "carregando") {
      handleFechamentoReply(text);
      return;
    }

    setLoading(true);
    try {
      const history = messages
        .filter(
          (m): m is ChatMessageItem & { type: "user" | "assistant"; content: string } =>
            m.type === "user" || m.type === "assistant"
        )
        .map((m) => ({ role: m.type, content: m.content }));
      history.push({ role: "user", content: text });

      const { text: replyText, lancamento } = await enviarMensagem(history);

      if (lancamento) {
        const lancamentoMsg: ChatMessageItem = {
          id: "l-" + gerarIdUnico(),
          type: "lancamento",
          content: replyText,
          lancamento,
          status: "pending",
        };
        setMessages((prev) => [...prev, lancamentoMsg]);
      } else {
        const assistantMsg: ChatMessageItem = {
          id: "a-" + gerarIdUnico(),
          type: "assistant",
          content: replyText,
        };
        setMessages((prev) => [...prev, assistantMsg]);
      }
      scrollToEnd();
    } catch (e) {
      const errMsg: ChatMessageItem = {
        id: "a-" + gerarIdUnico(),
        type: "assistant",
        content: e instanceof Error ? e.message : "Erro ao conectar com o assistente.",
      };
      setMessages((prev) => [...prev, errMsg]);
      scrollToEnd();
    } finally {
      setLoading(false);
    }
  }, [chatInput, loading, messages, scrollToEnd, fechamentoStep, handleFechamentoReply, iniciarFechamentoFranquia]);

  const footerPaddingBottom = Math.max(insets.bottom, 12) + 12;

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={[...GRADIENT_COLORS]}
        style={StyleSheet.absoluteFill}
      />

      <Modal
        visible={menuVisible}
        transparent
        animationType="fade"
        onRequestClose={closeMenu}
      >
        <Pressable style={styles.menuOverlay} onPress={closeMenu}>
          <Pressable style={styles.menuDrawer} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.menuDrawerTitle}>Menu</Text>
            {MENU_ITEMS.map((item) => {
              const IconComponent = item.icon;
              return (
                <Pressable
                  key={item.id}
                  style={({ pressed }) => [
                    styles.menuItem,
                    pressed && styles.menuItemPressed,
                  ]}
                  onPress={() => handleMenuItemPress(item.id)}
                  accessibilityLabel={item.title}
                >
                  <View style={styles.menuItemIconWrap}>
                    <IconComponent size={22} color="#ffffff" strokeWidth={2} />
                  </View>
                  <View style={styles.menuItemTextWrap}>
                    <Text style={styles.menuItemTitle}>{item.title}</Text>
                    <Text style={styles.menuItemDescription}>{item.description}</Text>
                  </View>
                </Pressable>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={[styles.keyboardView, { paddingTop: insets.top }]}
      >
        <View style={styles.header}>
          <Pressable
            style={styles.menuButton}
            onPress={openMenu}
            accessibilityLabel="Abrir menu"
          >
            <Menu size={26} color="#ffffff" strokeWidth={2} />
          </Pressable>
          <Text style={styles.headerTitle}>Financeiro</Text>
        </View>

        <ScrollView
          ref={scrollRef}
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {CARDS.map((card) => {
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
                accessibilityLabel={"Abrir " + card.title}
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

          <View style={styles.chatSection}>
            <Text style={styles.chatSectionTitle}>Chat com a IA</Text>
            {messages.length > 0 &&
              messages.map((msg) => {
                if (msg.type === "user") {
                  return (
                    <View key={msg.id} style={styles.bubbleRowUser}>
                      <View style={styles.bubbleUser}>
                        <Text style={styles.bubbleUserText}>{msg.content}</Text>
                      </View>
                    </View>
                  );
                }
                if (msg.type === "assistant") {
                  return (
                    <View key={msg.id} style={styles.bubbleRowAssistant}>
                      <View style={styles.bubbleAssistant}>
                        <Text style={styles.bubbleAssistantText}>{msg.content}</Text>
                      </View>
                    </View>
                  );
                }
                if (msg.type === "lancamento") {
                  if (msg.status === "cancelled") {
                    return (
                      <View key={msg.id} style={styles.bubbleRowAssistant}>
                        <View style={styles.bubbleAssistant}>
                          <Text style={styles.bubbleAssistantText}>Lançamento cancelado.</Text>
                        </View>
                      </View>
                    );
                  }
                  if (msg.status === "confirmed") {
                    return (
                      <View key={msg.id} style={styles.bubbleRowAssistant}>
                        <View style={styles.bubbleAssistant}>
                          <Text style={styles.bubbleAssistantText}>
                            Lançamento confirmado: {formatarValor(msg.lancamento.valor)} - {msg.lancamento.descricao}
                          </Text>
                        </View>
                      </View>
                    );
                  }
                  return (
                    <View key={msg.id} style={styles.bubbleRowAssistant}>
                      <View style={styles.cardLancamento}>
                        <Text style={styles.cardLancamentoTitle}>Confirmar lançamento</Text>
                        <Text style={styles.cardLancamentoLine}>
                          {formatarValor(msg.lancamento.valor)} - {msg.lancamento.descricao}
                        </Text>
                        <Text style={styles.cardLancamentoMeta}>
                          Pagou: {msg.lancamento.quemPagou} - Caixa: {msg.lancamento.tipoCaixa}
                        </Text>
                        <View style={styles.cardLancamentoButtons}>
                          <Pressable
                            style={({ pressed }) => [
                              styles.btnConfirmar,
                              pressed && styles.btnPressed,
                              savingLancamentoId === msg.id && styles.btnDisabled,
                            ]}
                            onPress={() => handleConfirmarLancamento(msg)}
                            disabled={savingLancamentoId === msg.id}
                          >
                            {savingLancamentoId === msg.id ? (
                              <ActivityIndicator size="small" color="#ffffff" />
                            ) : (
                              <Text style={styles.btnConfirmarText}>Confirmar Lançamento</Text>
                            )}
                          </Pressable>
                          <Pressable
                            style={({ pressed }) => [styles.btnCancelar, pressed && styles.btnPressed]}
                            onPress={() => updateLancamentoStatus(msg.id, "cancelled")}
                          >
                            <Text style={styles.btnCancelarText}>Cancelar</Text>
                          </Pressable>
                        </View>
                      </View>
                    </View>
                  );
                }
                if (msg.type === "planilha") {
                  const d = msg.data;
                  const totalGastos = d.totalGastos ?? 0;
                  const lucroLiquido = d.lucroLiquido ?? 0;
                  const valorFranqueado = d.valorFranqueado ?? 0;
                  const linhasP = d.linhasPadrao ?? [];
                  const linhasE = d.linhasEsporadico ?? [];
                  const linhasV = d.linhasVariavel ?? [];
                  return (
                    <View key={msg.id} style={styles.bubbleRowAssistant}>
                      <View style={styles.planilhaCard}>
                        <Text style={styles.planilhaTitle}>Planilha de Fechamento</Text>
                        <Text style={styles.planilhaSubtitle}>Part. {d.pctParticipacao}%</Text>
                        <View style={styles.planilhaTable}>
                          <View style={styles.planilhaRowHeader}>
                            <Text style={[styles.planilhaCell, styles.planilhaCellDesc, styles.planilhaCellHeader]} numberOfLines={1}>
                              Descritivo
                            </Text>
                            <Text style={[styles.planilhaCell, styles.planilhaCellNum, styles.planilhaCellHeader]}>Tipo</Text>
                            <Text style={[styles.planilhaCell, styles.planilhaCellNum, styles.planilhaCellHeader]}>Total</Text>
                          </View>
                          {linhasP.map((g, i) => (
                            <View key={"p-" + i} style={styles.planilhaRow}>
                              <Text style={[styles.planilhaCell, styles.planilhaCellDesc]} numberOfLines={1}>{g.fornecedor}</Text>
                              <Text style={[styles.planilhaCell, styles.planilhaCellNum]}>Rateado</Text>
                              <Text style={[styles.planilhaCell, styles.planilhaCellTotal]}>{formatarValor(g.valorRateado)}</Text>
                            </View>
                          ))}
                          {linhasE.map((g, i) => (
                            <View key={"e-" + i} style={styles.planilhaRow}>
                              <Text style={[styles.planilhaCell, styles.planilhaCellDesc]} numberOfLines={1}>{g.fornecedor}</Text>
                              <Text style={[styles.planilhaCell, styles.planilhaCellNum]}>Cheio</Text>
                              <Text style={[styles.planilhaCell, styles.planilhaCellTotal]}>{formatarValor(g.valorRateado)}</Text>
                            </View>
                          ))}
                          {linhasV.map((g, i) => (
                            <View key={"v-" + i} style={styles.planilhaRow}>
                              <Text style={[styles.planilhaCell, styles.planilhaCellDesc]} numberOfLines={1}>{g.fornecedor}</Text>
                              <Text style={[styles.planilhaCell, styles.planilhaCellNum]}>{g.isBoleto ? "Cheio" : "Rateado"}</Text>
                              <Text style={[styles.planilhaCell, styles.planilhaCellTotal]}>{formatarValor(g.valorTotal)}</Text>
                            </View>
                          ))}
                          <View style={[styles.planilhaRow, styles.planilhaRowTotal]}>
                            <Text style={[styles.planilhaCell, styles.planilhaCellDesc]}>Total gastos</Text>
                            <Text style={[styles.planilhaCell, styles.planilhaCellNum]}>-</Text>
                            <Text style={[styles.planilhaCell, styles.planilhaCellTotal]}>{formatarValor(totalGastos)}</Text>
                          </View>
                          <View style={[styles.planilhaRow, styles.planilhaRowHighlight]}>
                            <Text style={[styles.planilhaCell, styles.planilhaCellDesc]}>Faturamento bruto</Text>
                            <Text style={[styles.planilhaCell, styles.planilhaCellNum]}>-</Text>
                            <Text style={[styles.planilhaCell, styles.planilhaCellTotal]}>{formatarValor(d.faturamentoBruto)}</Text>
                          </View>
                          <View style={[styles.planilhaRow, styles.planilhaRowHighlight]}>
                            <Text style={[styles.planilhaCell, styles.planilhaCellDesc]}>Lucro líquido</Text>
                            <Text style={[styles.planilhaCell, styles.planilhaCellNum]}>-</Text>
                            <Text style={[styles.planilhaCell, styles.planilhaCellTotal]}>{formatarValor(lucroLiquido)}</Text>
                          </View>
                          <View style={[styles.planilhaRow, styles.planilhaRowFranquia]}>
                            <Text style={[styles.planilhaCell, styles.planilhaCellDesc]}>Franqueado ({d.pctFranqueado ?? 0}%)</Text>
                            <Text style={[styles.planilhaCell, styles.planilhaCellNum]}>-</Text>
                            <Text style={[styles.planilhaCell, styles.planilhaCellTotal]}>{formatarValor(valorFranqueado)}</Text>
                          </View>
                        </View>
                        {msg.status === "confirmed" ? (
                          <View style={styles.planilhaConfirmWrap}>
                            <Text style={styles.planilhaConfirmSuccess}>
                              Fechamento registrado e lançamento financeiro enviado para o Pessoal!
                            </Text>
                          </View>
                        ) : (msg.fechamentoContexto ?? getContextoPersistente()) ? (
                          <View style={styles.planilhaConfirmWrap}>
                            <Text style={styles.planilhaConfirmPergunta}>
                              Os valores estão corretos? Deseja confirmar o fechamento e registrar o pagamento?
                            </Text>
                            <Pressable
                              style={({ pressed }) => [
                                styles.btnConfirmar,
                                pressed && styles.btnPressed,
                                savingFechamentoId === msg.id && styles.btnDisabled,
                              ]}
                              onPress={() => handleConfirmarFechamento(msg)}
                              disabled={savingFechamentoId === msg.id}
                            >
                              {savingFechamentoId === msg.id ? (
                                <ActivityIndicator size="small" color="#ffffff" />
                              ) : (
                                <Text style={styles.btnConfirmarText}>Confirmar fechamento e registrar pagamento</Text>
                              )}
                            </Pressable>
                          </View>
                        ) : null}
                      </View>
                    </View>
                  );
                }
                return null;
              })}
            {loading && (
              <View style={styles.bubbleRowAssistant}>
                <View style={styles.bubbleAssistant}>
                  <ActivityIndicator size="small" color={TITLE_COLOR} />
                  <Text style={[styles.bubbleAssistantText, styles.loadingText]}> Processando...</Text>
                </View>
              </View>
            )}
          </View>
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: footerPaddingBottom }]}>
          <TextInput
            style={styles.input}
            placeholder="Ex: 45 reais no mercado, paguei eu (Allyson), Pessoal"
            placeholderTextColor={INPUT_PLACEHOLDER}
            value={chatInput}
            onChangeText={setChatInput}
            multiline
            maxLength={500}
            editable={!loading}
            blurOnSubmit={false}
            onKeyDown={
              Platform.OS === "web"
                ? (e: { key: string; shiftKey: boolean; preventDefault: () => void }) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      if (chatInput.trim() && !loading) handleSendMessage();
                    }
                  }
                : undefined
            }
            onKeyPress={
              Platform.OS === "web"
                ? (e: { key: string; shiftKey: boolean; preventDefault: () => void }) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      if (chatInput.trim() && !loading) handleSendMessage();
                    }
                  }
                : undefined
            }
          />
          <Pressable
            onPress={handleSendMessage}
            disabled={loading || !chatInput.trim()}
            style={({ pressed }) => [
              styles.sendButton,
              (loading || !chatInput.trim()) && styles.sendButtonDisabled,
              pressed && !loading && styles.sendButtonPressed,
            ]}
            accessibilityLabel="Enviar mensagem"
          >
            {loading ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Send size={20} color="#ffffff" strokeWidth={2.5} />
            )}
          </Pressable>
        </View>
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
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  menuButton: {
    padding: 8,
    marginLeft: -8,
    borderRadius: 12,
  },
  menuOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    flexDirection: "row",
    justifyContent: "flex-start",
  },
  menuDrawer: {
    width: 280,
    maxWidth: "85%",
    backgroundColor: "#001A3D",
    paddingTop: 56,
    paddingHorizontal: 16,
    paddingBottom: 24,
    borderTopRightRadius: 16,
    borderBottomRightRadius: 16,
    shadowColor: "#000",
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 16,
  },
  menuDrawerTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: "rgba(255,255,255,0.6)",
    marginBottom: 16,
    textTransform: "uppercase",
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 4,
  },
  menuItemPressed: {
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  menuItemIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  menuItemTextWrap: {
    flex: 1,
  },
  menuItemTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#ffffff",
  },
  menuItemDescription: {
    fontSize: 12,
    color: "rgba(255,255,255,0.7)",
    marginTop: 2,
  },
  headerTitle: {
    marginLeft: 12,
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
    paddingBottom: 24,
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
  chatSection: {
    marginTop: 24,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.15)",
  },
  chatSectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "rgba(255,255,255,0.8)",
    marginBottom: 8,
  },
  planilhaCard: {
    maxWidth: "100%",
    backgroundColor: CARD_BG,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(0,26,61,0.12)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 8,
  },
  planilhaTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: TITLE_COLOR,
    marginBottom: 4,
  },
  planilhaSubtitle: {
    fontSize: 12,
    color: SUBTITLE_COLOR,
    marginBottom: 12,
  },
  planilhaTable: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    overflow: "hidden",
  },
  planilhaRowHeader: {
    flexDirection: "row",
    backgroundColor: "#001A3D",
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  planilhaRow: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
    paddingVertical: 8,
    paddingHorizontal: 8,
    backgroundColor: "#ffffff",
  },
  planilhaRowTotal: {
    backgroundColor: "#f8fafc",
    fontWeight: "600",
  },
  planilhaRowHighlight: {
    backgroundColor: "#f0fdf4",
  },
  planilhaRowFranquia: {
    backgroundColor: "#ecfdf5",
    borderTopWidth: 2,
    borderTopColor: "#001A3D",
  },
  planilhaCell: {
    fontSize: 12,
    color: TITLE_COLOR,
  },
  planilhaCellDesc: {
    flex: 1.2,
    minWidth: 0,
  },
  planilhaCellNum: {
    width: 56,
    textAlign: "right",
  },
  planilhaCellTotal: {
    width: 72,
    textAlign: "right",
    fontWeight: "600",
  },
  planilhaCellHeader: {
    color: "#ffffff",
    fontWeight: "700",
  },
  planilhaConfirmWrap: {
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
  },
  planilhaConfirmPergunta: {
    fontSize: 14,
    color: TITLE_COLOR,
    marginBottom: 12,
  },
  planilhaConfirmSuccess: {
    fontSize: 14,
    fontWeight: "600",
    color: "#15803d",
  },
  bubbleRowUser: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginBottom: 8,
  },
  bubbleRowAssistant: {
    flexDirection: "row",
    justifyContent: "flex-start",
    marginBottom: 8,
  },
  bubbleUser: {
    maxWidth: "85%",
    backgroundColor: CHAT_BUTTON_BG,
    borderRadius: 16,
    borderBottomRightRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bubbleUserText: {
    fontSize: 15,
    color: "#ffffff",
  },
  bubbleAssistant: {
    maxWidth: "85%",
    backgroundColor: CARD_BG,
    borderRadius: 16,
    borderBottomLeftRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 4,
  },
  bubbleAssistantText: {
    fontSize: 15,
    color: TITLE_COLOR,
  },
  loadingText: {
    marginLeft: 6,
  },
  cardLancamento: {
    maxWidth: "100%",
    backgroundColor: CARD_BG,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(0,26,61,0.2)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  cardLancamentoTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: TITLE_COLOR,
    marginBottom: 8,
  },
  cardLancamentoLine: {
    fontSize: 15,
    color: TITLE_COLOR,
    marginBottom: 4,
  },
  cardLancamentoMeta: {
    fontSize: 13,
    color: SUBTITLE_COLOR,
    marginBottom: 12,
  },
  cardLancamentoButtons: {
    flexDirection: "row",
    gap: 10,
  },
  btnConfirmar: {
    flex: 1,
    backgroundColor: "#15803d",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  btnDisabled: {
    opacity: 0.7,
  },
  btnCancelar: {
    flex: 1,
    backgroundColor: ICON_BG,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  btnPressed: {
    opacity: 0.9,
  },
  btnConfirmarText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#ffffff",
  },
  btnCancelarText: {
    fontSize: 14,
    fontWeight: "600",
    color: SUBTITLE_COLOR,
  },
  footer: {
    backgroundColor: CARD_BG,
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
    paddingHorizontal: 16,
    paddingTop: 12,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 12,
  },
  input: {
    flex: 1,
    backgroundColor: ICON_BG,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: TITLE_COLOR,
    minHeight: 44,
    maxHeight: 96,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: CHAT_BUTTON_BG,
    alignItems: "center",
    justifyContent: "center",
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  sendButtonPressed: {
    opacity: 0.85,
  },
});
