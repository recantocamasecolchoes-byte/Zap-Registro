import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { GoogleGenAI, Type } from "@google/genai";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// Lazy-loaded Gemini AI client
let aiInstance: GoogleGenAI | null = null;
function getGenAI() {
  if (!aiInstance) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is required. Please set it in Settings > Secrets.");
    }
    aiInstance = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return aiInstance;
}

// 1. Cadastrar pedido via IA
const pedidoSchema = {
  type: Type.OBJECT,
  properties: {
    nomeCompleto: { type: Type.STRING, description: "Nome completo do comprador." },
    telefone1: { type: Type.STRING, description: "Telefone de contato preferencial (exemplo: (11) 99999-9999)." },
    telefone2: { type: Type.STRING, description: "Telefone de contato secundário, se houver. Caso contrário, deixar em branco." },
    endereco: { type: Type.STRING, description: "Endereço completo para entrega do móvel." },
    city: { type: Type.STRING, description: "Cidade extraída do endereço ou do contexto do pedido (ex: Campinas, Poços de Caldas, São Paulo, Alfenas). Se não encontrar, deixar em branco." },
    state: { type: Type.STRING, description: "Sigla do estado (UF) de 2 letras em maiúsculo (ex: SP, MG). Se não encontrar, deixar em branco." },
    produto: { type: Type.STRING, description: "Nome do produto/móvel." },
    cor: { type: Type.STRING, description: "Cor ou estampa do produto/móvel, se mencionada." },
    quantidade: { type: Type.INTEGER, description: "Quantidade vendida. Se não for especificada, o padrão é 1." },
    formaPagamento: { type: Type.STRING, description: "Forma de pagamento (PIX, Dinheiro, Cartão, Boleto, etc.)." },
    valorTotal: { type: Type.NUMBER, description: "Valor total do pedido (R$). Se não encontrar, retornar 0." },
    comissaoSugerida: { type: Type.NUMBER, description: "Valor de comissão estimado em R$. Se não estiver explícito, sugerir 15% do valor total." },
    observacoes: { type: Type.STRING, description: "Observações extras ou informações como CNPJ e detalhes de agendamento." }
  },
  required: ["nomeCompleto", "produto", "valorTotal", "comissaoSugerida"]
};

const rapidPedidoSchema = {
  type: Type.OBJECT,
  properties: {
    nomeCompleto: { type: Type.STRING, description: "Nome completo do comprador." },
    telefone1: { type: Type.STRING, description: "Telefone de contato preferencial." },
    city: { type: Type.STRING, description: "Cidade extraída do endereço ou do contexto do pedido. Se não encontrar, retornar string vazia." },
    state: { type: Type.STRING, description: "Sigla do estado com 2 letras em maiúsculo (ex: SP, MG). Se não encontrar, retornar string vazia." },
    produto: { type: Type.STRING, description: "Nome do produto/móvel." },
    formaPagamento: { type: Type.STRING, description: "Forma de pagamento." },
    valorTotal: { type: Type.NUMBER, description: "Valor de venda. Se não encontrar, retorne 0." }
  },
  required: ["nomeCompleto", "produto", "valorTotal"]
};

app.post("/api/gemini/parse-pedido", async (req, res) => {
  try {
    const { text, rapidMode } = req.body;
    if (!text || typeof text !== "string") {
      return res.status(400).json({ error: "O texto do pedido é obrigatório." });
    }

    const ai = getGenAI();
    let prompt;
    let schemaToUse;
    let systemInstruction;

    if (rapidMode) {
      prompt = `Analise a ficha curta ou mensagem e extraia apenas o essencial muito rapidamente:
Ficha de entrada:
"${text}"`;
      schemaToUse = rapidPedidoSchema;
      systemInstruction = "Você é um assistente ultra-rápido de pedidos. Extraia o nome do cliente, telefone, descrição resumida do produto, forma de pagamento e valor total. Seja conciso e de extrema velocidade de resposta.";
    } else {
      prompt = `Analise detalhadamente a seguinte ficha ou mensagem de WhatsApp sobre um pedido de móveis. Extraia os dados de acordo com o esquema fornecido:

Ficha de entrada:
"${text}"`;
      schemaToUse = pedidoSchema;
      systemInstruction = "Você é um assistente administrativo de logística em uma fábrica de móveis. Extraia as informações estruturadas de mensagens textuais do WhatsApp com precisão. Se dados específicos como telefones ou cor faltarem, retorne string vazia. O valorTotal e comissaoSugerida devem ser puros números decimais.";
    }

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: schemaToUse,
        systemInstruction
      }
    });

    const textResult = response.text;
    if (!textResult) {
      throw new Error("Não foi possível gerar resposta do modelo Gemini.");
    }

    let parsedData = JSON.parse(textResult.trim());
    if (rapidMode) {
      // Normallize to expected complete schema structure
      parsedData = {
        nomeCompleto: parsedData.nomeCompleto || "",
        telefone1: parsedData.telefone1 || "",
        telefone2: "",
        endereco: "",
        city: parsedData.city || "",
        state: parsedData.state || "",
        produto: parsedData.produto || "",
        cor: "",
        quantidade: 1,
        formaPagamento: parsedData.formaPagamento || "PIX",
        valorTotal: Number(parsedData.valorTotal) || 0,
        comissaoSugerida: 0,
        observacoes: ""
      };
    }

    res.json({ success: true, data: parsedData });
  } catch (error: any) {
    console.error("Erro no parse de pedido via Gemini:", error);
    res.status(500).json({ error: error.message || "Erro ao analisar o pedido." });
  }
});

// 2. Marcar pedido como entregue via IA
const entregaSchema = {
  type: Type.OBJECT,
  properties: {
    matchedOrderId: { type: Type.STRING, description: "O ID do pedido correspondente que foi entregue. Deve ser exatamente um dos IDs da lista fornecida. Se não corresponder a nenhum, retorne string vazia ou nulo." },
    reason: { type: Type.STRING, description: "Breve explicação da correspondência." }
  },
  required: ["matchedOrderId"]
};

app.post("/api/gemini/parse-entregue", async (req, res) => {
  try {
    const { text, activeOrders } = req.body;
    if (!text || typeof text !== "string") {
      return res.status(400).json({ error: "O texto de entrega é obrigatório." });
    }
    if (!activeOrders || !Array.isArray(activeOrders)) {
      return res.status(400).json({ error: "A lista de pedidos ativos é obrigatória." });
    }

    if (activeOrders.length === 0) {
      return res.json({ success: true, matchedOrderId: null, reason: "Nenhum pedido ativo para correspondência." });
    }

    const ai = getGenAI();
    const activeOrdersListString = activeOrders.map(o => `ID: "${o.id}" | Cliente: "${o.nomeCompleto}" | Produto: "${o.produto}"`).join("\n");
    
    const prompt = `Identifique qual dos pedidos ativos abaixo corresponde à mensagem de confirmação de entrega.
Mensagem de confirmação de entrega:
"${text}"

Lista de pedidos ativos:
${activeOrdersListString}

DICA: Se o texto for simples como "João Silva entregue", procure por "João Silva" na lista de pedidos ativos. Responda com o correspondente correto seguindo o padrão de JSON.`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: entregaSchema,
        systemInstruction: "Você é um assistente de despacho que correlaciona mensagens curtas de entregadores do WhatsApp (ex: 'João Silva entregue' ou 'Cama preta da Maria entregue') a pedidos cadastrados no banco de dados."
      }
    });

    const textResult = response.text;
    if (!textResult) {
      throw new Error("Não foi possível gerar resposta do modelo Gemini.");
    }

    const parsedResult = JSON.parse(textResult.trim());
    res.json({ success: true, matchedOrderId: parsedResult.matchedOrderId || null, reason: parsedResult.reason });
  } catch (error: any) {
    console.error("Erro no parse de entrega via Gemini:", error);
    res.status(500).json({ error: error.message || "Erro ao associar entrega ao pedido." });
  }
});

// Setup Vite & static serving
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
