import { MarketFeatures, RegimeLabel, TriggerEvaluation, VetoResult } from './types';

export function applyMetaFilters(
  features: MarketFeatures,
  regime: RegimeLabel,
  evaluations: TriggerEvaluation[],
  consecutiveLossCount: number = 0
): VetoResult {
  const { marketContext, indicators, currentPrice } = features;
  const reasons: string[] = [];
  let vetoed = false;

  // Data integrity filter
  const { isSyntheticData, isStaleData, dataAgeMs, dataSourceType, validationMode } = features.marketContext;
  const provider = process.env.MARKET_DATA_PROVIDER || "fastforex";
  
  if (validationMode === "backstage") {
    if (provider === "fastforex") {
      if (dataSourceType !== "fastforex_rest") {
        vetoed = true;
        reasons.push("VETO: validation_mode_mismatch - Backstage apenas FastForex REST.");
      }
    }
  } else {
    if (provider === "fastforex") {
      if (dataSourceType !== "fastforex_rest" && dataSourceType !== "fastforex_stream") {
        vetoed = true;
        reasons.push("VETO: data_source_not_operational - FastForex não está no modo operacional.");
      }
    }
  }

  let hasAuth = features.marketContext.configured;
  
  if (!hasAuth || dataAgeMs === null || dataAgeMs === undefined || dataAgeMs > 10000 || isStaleData || isSyntheticData) {
    vetoed = true;
    if (provider === "fastforex") {
      reasons.push("VETO: market_data_unavailable_or_stale - FastForex indisponível ou stale.");
    } else {
      reasons.push("VETO: market_data_unavailable_or_stale - Feed indisponível ou stale.");
    }
  }

  // Spread filter
  if (marketContext.spreadPips !== undefined && marketContext.maxAllowedSpreadPips !== undefined) {
    if (marketContext.spreadPips > marketContext.maxAllowedSpreadPips) {
      vetoed = true;
      reasons.push(`VETO: spread_too_high - spread (${marketContext.spreadPips.toFixed(1)} pips) acima do limite operacional (${marketContext.maxAllowedSpreadPips.toFixed(1)}).`);
    }
  }

  // News & Session Filters
  if (marketContext.newsRisk === 'HIGH' || marketContext.minutesToHighImpactNews <= 15) {
    vetoed = true;
    reasons.push(`VETO: Notícia de alto impacto em ${marketContext.minutesToHighImpactNews}min (Blackout de Notícia).`);
  }

  if (marketContext.session === 'CLOSED') {
    vetoed = true;
    reasons.push("VETO: Sessão de mercado fechada/inativa.");
  }

  // Regime Veto
  if (regime === 'chaos') {
    vetoed = true;
    reasons.push("VETO: Regime de Caos detectado (alta aleatoriedade, sem edge claro).");
  }

  // Volatility Veto (ATR relative)
  const relativeAtr = indicators.atr / currentPrice;
  if (relativeAtr < 0.00005) { // Very dead market
    vetoed = true;
    reasons.push("VETO: Mercado morto (ATR muito baixo, risco de whipsaw).");
  } else if (relativeAtr > 0.003) { // Extreme
    vetoed = true;
    reasons.push("VETO: Volatilidade extrema (ATR muito alto).");
  }

  // Conflicting signals
  const calls = evaluations.filter(e => e.signal === 'CALL');
  const puts = evaluations.filter(e => e.signal === 'PUT');
  
  if (calls.length > 0 && puts.length > 0) {
    vetoed = true;
    reasons.push("VETO: Sinais conflitantes entre as estratégias ativas.");
  }

  if (!features.marketContext.disableConsecutiveLossVeto && consecutiveLossCount >= 2) {
    vetoed = true;
    reasons.push(`VETO: Anti-Loss Sucessivo (${consecutiveLossCount} losses). Mercado instável temporariamente.`);
  }
  return { vetoed, vetoReasons: reasons };
}
