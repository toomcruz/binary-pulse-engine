import { MarketRegime } from "./types";

export interface StrategyRoute {
  regime: MarketRegime;
  allowedStrategies: string[];
  blockedStrategies: string[];
  preferredDirection: "CALL" | "PUT" | "BOTH" | "NONE";
  reasons: string[];
}

export function routeStrategies(regime: MarketRegime): StrategyRoute {
  switch (regime) {
    case "TREND_UP":
      return {
        regime,
        allowedStrategies: ["trend", "price_action", "fvg", "candle_flow", "order_block"],
        blockedStrategies: ["reversion"],
        preferredDirection: "CALL",
        reasons: ["Tendência de alta confirmada: priorizar operações a favor do movimento (CALL).", "Reversões (PUT) bloqueadas contra a tendência."]
      };
    case "TREND_DOWN":
      return {
        regime,
        allowedStrategies: ["trend", "price_action", "fvg", "candle_flow", "order_block"],
        blockedStrategies: ["reversion"],
        preferredDirection: "PUT",
        reasons: ["Tendência de baixa confirmada: priorizar operações a favor do movimento (PUT).", "Reversões (CALL) bloqueadas contra a tendência."]
      };
    case "RANGE":
      return {
        regime,
        allowedStrategies: ["reversion", "liquidity_sweep", "price_action"],
        blockedStrategies: ["trend", "breakout"],
        preferredDirection: "BOTH",
        reasons: ["Mercado lateral: buscar reversões nas extremidades do range.", "Estratégias de seguimento de tendência e rompimento bloqueadas."]
      };
    case "BREAKOUT_UP":
      return {
        regime,
        allowedStrategies: ["breakout", "trend", "candle_flow"],
        blockedStrategies: ["reversion"],
        preferredDirection: "CALL",
        reasons: ["Rompimento de alta detectado: priorizar continuação do movimento.", "Bloqueado PUT sem falha clara do rompimento."]
      };
    case "BREAKOUT_DOWN":
      return {
        regime,
        allowedStrategies: ["breakout", "trend", "candle_flow"],
        blockedStrategies: ["reversion"],
        preferredDirection: "PUT",
        reasons: ["Rompimento de baixa detectado: priorizar continuação do movimento.", "Bloqueado CALL sem falha clara do rompimento."]
      };
    case "COMPRESSION":
      return {
        regime,
        allowedStrategies: [],
        blockedStrategies: ["all"],
        preferredDirection: "NONE",
        reasons: ["Mercado em compressão extrema (baixa volatilidade). Entradas bloqueadas até rompimento."]
      };
    case "HIGH_VOLATILITY":
      return {
        regime,
        allowedStrategies: [],
        blockedStrategies: ["all"],
        preferredDirection: "NONE",
        reasons: ["Alta volatilidade ou caos estrutural. Entradas bloqueadas para preservação de capital."]
      };
    case "TRANSITION":
    default:
      return {
        regime,
        allowedStrategies: [],
        blockedStrategies: ["all"],
        preferredDirection: "NONE",
        reasons: ["Sem clareza direcional (Transição). Entradas bloqueadas até novo regime se estabelecer."]
      };
  }
}
