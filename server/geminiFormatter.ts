import { GoogleGenAI } from "@google/genai";
import { FinalSignalDecision } from "./types";

let aiClient: GoogleGenAI | null = null;

function getAiClient(): GoogleGenAI {
  if (!aiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error("GEMINI_API_KEY environment variable is required.");
    }
    aiClient = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return aiClient;
}

export async function formatDecisionWithGemini(decision: any): Promise<string[]> {
  if (!process.env.GEMINI_API_KEY) {
    return fallbackFormatter(decision);
  }

  try {
    const ai = getAiClient();
    
    // Construct the context from the deterministic engine
    const regime = decision.regimeResult;
    const callScore = decision.callScore;
    const putScore = decision.putScore;
    
    const context = `
      ATIVO: ${decision.asset}
      TIMEFRAME: ${decision.timeframe}
      
      REGIME: ${decision.regime}
      CONFIANÇA DO REGIME: ${(regime?.regimeConfidence || 0) * 100}%
      TEMPO NO REGIME: ${regime?.candlesInRegime || 0} candles
      
      DIREÇÃO PREDOMINANTE: ${decision.route?.preferredDirection || "NONE"}
      SCORE CALL: ${callScore?.total || 0}
      SCORE PUT: ${putScore?.total || 0}
      DIFERENÇA DIRECIONAL: ${Math.abs((callScore?.total || 0) - (putScore?.total || 0))}
      QUALIDADE DA ENTRADA: ${decision.entryQuality || 0}%
      
      ESTRATÉGIA ATIVADA: ${decision.strategy}
      DECISÃO: ${decision.signal}
      
      CONFIRMAÇÕES: ${decision.confirmations ? decision.confirmations.join(" | ") : "-"}
      EVIDÊNCIAS CONTRÁRIAS: ${decision.counterEvidence ? decision.counterEvidence.join(" | ") : "-"}
      MOTIVO DO BLOQUEIO: ${decision.blockReasons ? decision.blockReasons.join(" | ") : "-"}
      MOTIVOS DE PORTA DE INTEGRIDADE: ${decision.gateStatus === "BLOCKED" ? decision.reasons.join(" | ") : "Nenhum"}
    `;

    const prompt = `
    Você é um Motor de Análise Técnica Avançada.
    Receba os dados do cálculo determinístico abaixo e gere UMA EXPLICAÇÃO TÉCNICA E ESTRUTURADA E OBJETIVA baseada ESTREITAMENTE e EXCLUSIVAMENTE neles.
    
    Não decida CALL ou PUT. A decisão já foi tomada e está descrita nos dados. Apenas relate.
    NÃO dê lições de moral, alertas financeiros genéricos, recomendações de valor, nem fale sobre gestão de banca.
    Use os termos corretos da análise técnica.

    DADOS DETERMINÍSTICOS:
    ${context}
    
    FORMATO OBRIGATÓRIO DA RESPOSTA:
    ATIVO: [ativo]
    TIMEFRAME: [timeframe]
    MERCADO: [mercado, ex: Forex]
    
    REGIME: [Regime calculado]
    CONFIANÇA DO REGIME: [X]%
    TEMPO NO REGIME: [Y] candles
    
    DIREÇÃO PREDOMINANTE: [Direção]
    SCORE CALL: [Score]
    SCORE PUT: [Score]
    DIFERENÇA DIRECIONAL: [Diff]
    QUALIDADE DA ENTRADA: [Qualidade]%
    
    ESTRATÉGIA ATIVADA: [Estratégia]
    DECISÃO: [CALL, PUT ou SEM SINAL]
    
    CONFIRMAÇÕES:
    - [confirmação 1]
    - [confirmação 2]
    
    EVIDÊNCIAS CONTRÁRIAS:
    - [evidência 1]
    
    MOTIVO DO BLOQUEIO:
    - [motivo 1, se houver]
    
    INVALIDAÇÃO TÉCNICA:
    [O que invalidaria a operação no gráfico]
    
    CONCLUSÃO:
    [Frase objetiva da decisão]
    `;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt
    });

    const text = response.text || "";
    return text.split("\n").map(l => l.trim()).filter(l => l.length > 0);
  } catch (error) {
    if ((error as any).status === "RESOURCE_EXHAUSTED" || (error as any).status === 429) { console.warn("Gemini API rate limit reached, falling back to deterministic formatter."); } else { console.warn("Gemini API error, falling back to deterministic formatter:", (error as Error).message); }
    return fallbackFormatter(decision);
  }
}

function fallbackFormatter(decision: any): string[] {
  const lines: string[] = [];
  lines.push(`ATIVO: ${decision.asset} | TIMEFRAME: ${decision.timeframe}`);
  lines.push(`REGIME: ${decision.regime?.toUpperCase()} (Confiança: ${((decision.regimeResult?.regimeConfidence || 0) * 100).toFixed(0)}%)`);
  lines.push(`TEMPO NO REGIME: ${decision.regimeResult?.candlesInRegime || 0} velas`);
  lines.push(`DIREÇÃO: ${decision.route?.preferredDirection} | QUALIDADE: ${decision.entryQuality}%`);
  lines.push(`SCORE CALL: ${decision.callScore?.total || 0} | SCORE PUT: ${decision.putScore?.total || 0}`);
  lines.push(`ESTRATÉGIA: ${decision.strategy}`);
  lines.push(`DECISÃO: ${decision.signal}`);
  
  if (decision.confirmations && decision.confirmations.length > 0) {
    lines.push(`CONFIRMAÇÕES: ${decision.confirmations.join(" | ")}`);
  }
  if (decision.counterEvidence && decision.counterEvidence.length > 0) {
    lines.push(`EVIDÊNCIAS CONTRÁRIAS: ${decision.counterEvidence.join(" | ")}`);
  }
  if (decision.blockReasons && decision.blockReasons.length > 0) {
    lines.push(`MOTIVO DO BLOQUEIO: ${decision.blockReasons.join(" | ")}`);
  }
  if (decision.gateStatus === "BLOCKED") {
    const integrityReasons = Array.isArray(decision.reasons) ? decision.reasons : [];
    lines.push(`INTEGRIDADE BLOQUEADA: ${integrityReasons.join(" | ")}`);
  }
  
  return lines;
}
