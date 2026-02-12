/**
 * Serviço Groq - Assistente financeiro Atlas Fibra
 * Modelo: llama3-8b-8192
 */

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.1-8b-instant";

const SYSTEM_PROMPT = `Você é o assistente financeiro da Atlas Fibra. Sua missão é extrair 4 dados de cada frase do usuário:
1. Valor (número, em reais)
2. Descrição (texto do gasto/receita)
3. Quem Pagou (exatamente "Allyson" ou "Gabriel")
4. Tipo de Caixa (exatamente "Atlas", "Franquia" ou "Pessoal")

Se faltar algum dado, pergunte educadamente em uma frase curta.
Se tiver tudo, retorne APENAS um objeto JSON válido, sem markdown e sem texto antes ou depois, no formato:
{"valor": número, "descricao": "string", "quemPagou": "Allyson" ou "Gabriel", "tipoCaixa": "Atlas" ou "Franquia" ou "Pessoal"}

Exemplos de resposta quando completo:
{"valor": 45.50, "descricao": "Mercado", "quemPagou": "Allyson", "tipoCaixa": "Pessoal"}`;

export interface LancamentoExtraido {
  valor: number;
  descricao: string;
  quemPagou: "Allyson" | "Gabriel";
  tipoCaixa: "Atlas" | "Franquia" | "Pessoal";
}

function getApiKey(): string {
  const key =
    typeof process !== "undefined" && process.env?.EXPO_PUBLIC_GROQ_API_KEY;
  if (!key || key === "sua_chave_aqui") {
    throw new Error(
      "EXPO_PUBLIC_GROQ_API_KEY não configurada. Crie um arquivo .env com sua chave Groq."
    );
  }
  return key;
}

/** Extrai JSON de uma string (pode vir dentro de ```json ... ```) */
function extrairJson(texto: string): LancamentoExtraido | null {
  const trimmed = texto.trim();
  // Tenta parse direto
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
      const valor = Number(parsed.valor);
      const descricao = typeof parsed.descricao === "string" ? parsed.descricao : "";
      const quemPagou = parsed.quemPagou === "Gabriel" ? "Gabriel" : "Allyson";
      const tipoCaixa =
        parsed.tipoCaixa === "Franquia"
          ? "Franquia"
          : parsed.tipoCaixa === "Atlas"
            ? "Atlas"
            : "Pessoal";
      if (!Number.isFinite(valor) || valor <= 0 || !descricao) return null;
      return { valor, descricao, quemPagou, tipoCaixa };
    } catch {
      return null;
    }
  }
  return null;
}

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

/**
 * Envia mensagens ao Groq e retorna a resposta do assistente.
 * Se a resposta for um lançamento completo, retorna { text, lancamento }.
 */
export async function enviarMensagem(
  mensagens: ChatMessage[]
): Promise<{ text: string; lancamento: LancamentoExtraido | null }> {
  const apiKey = getApiKey();
  const body = {
    model: MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      ...mensagens.map((m) => ({ role: m.role, content: m.content })),
    ],
    temperature: 0.2,
    max_tokens: 256,
  };

  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Groq API: ${res.status} ${errText}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content =
    data.choices?.[0]?.message?.content?.trim() ?? "Desculpe, não consegui processar.";
  const lancamento = extrairJson(content);
  const text = lancamento ? content : content;
  return { text, lancamento };
}
