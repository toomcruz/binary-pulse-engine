import { MarketFeatures, RegimeLabel, TriggerEvaluation, Candle } from '../types';

export function evaluateExtremeRetrace(features: MarketFeatures, regime: RegimeLabel): TriggerEvaluation {
  const { indicators, closedCandle, candles = [] } = features;
  const { rsi, bollinger, atr } = indicators;
  const currentPrice = closedCandle.close;
  
  const evalResult: TriggerEvaluation = {
    strategy: 'extremeRetrace',
    signal: 'NEUTRAL',
    technicalScore: 0,
    reasons: []
  };

  if (regime === 'breakoutCandidate' || regime === 'chaos') {
    evalResult.reasons.push("Regime incompatível (Breakout ou Caos)");
    return evalResult;
  }

  // Volatility Filter (ATR low blocks, ATR extreme blocks)
  const relativeAtr = atr / currentPrice;
  if (relativeAtr < 0.00008) {
    evalResult.reasons.push("FILTRO: Volatilidade muito baixa (ATR baixo bloqueia).");
    return evalResult;
  }
  if (relativeAtr > 0.0025) {
    evalResult.reasons.push("FILTRO: Volatilidade extrema perigosa (ATR extremo bloqueia).");
    return evalResult;
  }

  let isCall = false;
  let isPut = false;
  let score = 50;

  // 1. LIQUIDITY SWEEP DETECTION (Last 15 candles range sweep)
  let sweepBullish = false;
  let sweepBearish = false;
  if (candles.length >= 16) {
    const lookback = candles.slice(-16, -1);
    const highs = lookback.map(c => c.high);
    const lows = lookback.map(c => c.low);
    const localMax = Math.max(...highs);
    const localMin = Math.min(...lows);

    // Bullish Sweep: Low sweeps below localMin, but close is above localMin
    if (closedCandle.low < localMin && closedCandle.close > localMin) {
      sweepBullish = true;
      evalResult.reasons.push("Liquidity Sweep de Fundo (varreu fundo recente e voltou para dentro da estrutura).");
    }
    // Bearish Sweep: High sweeps above localMax, but close is below localMax
    if (closedCandle.high > localMax && closedCandle.close < localMax) {
      sweepBearish = true;
      evalResult.reasons.push("Liquidity Sweep de Topo (varreu topo recente e voltou para dentro da estrutura).");
    }
  }

  // 2. SUPPORT & RESISTANCE (Min 2 touches in last 40 candles, reject with wick, close in favor)
  let srBullish = false;
  let srBearish = false;
  if (candles.length >= 25) {
    const lookback = candles.slice(-25, -1);
    // Find clusters of local lows and highs
    const lows = lookback.map(c => c.low);
    const highs = lookback.map(c => c.high);
    
    // We search if current low/high is close to a historical touch
    const tolerance = currentPrice * 0.0002;
    
    let supportTouches = 0;
    let resistanceTouches = 0;

    for (const l of lows) {
      if (Math.abs(closedCandle.low - l) <= tolerance) supportTouches++;
    }
    for (const h of highs) {
      if (Math.abs(closedCandle.high - h) <= tolerance) resistanceTouches++;
    }

    const bodySize = Math.abs(closedCandle.close - closedCandle.open);
    const lowerShadow = Math.min(closedCandle.open, closedCandle.close) - closedCandle.low;
    const upperShadow = closedCandle.high - Math.max(closedCandle.open, closedCandle.close);

    // Support: min 2 touches, reject with lower wick, close in favor (close > open)
    if (supportTouches >= 2 && lowerShadow > bodySize * 1.5 && closedCandle.close > closedCandle.open) {
      srBullish = true;
      evalResult.reasons.push(`Suporte validado com ${supportTouches} toques, rejeição com pavio inferior e fechamento favorável.`);
    }
    // Resistance: min 2 touches, reject with upper wick, close in favor (close < open)
    if (resistanceTouches >= 2 && upperShadow > bodySize * 1.5 && closedCandle.close < closedCandle.open) {
      srBearish = true;
      evalResult.reasons.push(`Resistência validada com ${resistanceTouches} toques, rejeição com pavio superior e fechamento favorável.`);
    }
  }

  // Bollinger & RSI Standard Checks
  if (closedCandle.low <= bollinger.lower && rsi < 30) {
    isCall = true;
    score += 15;
    evalResult.reasons.push("Preço tocou/excedeu banda inferior com RSI sobrevendido.");
    if (closedCandle.close > bollinger.lower) {
      score += 10;
      evalResult.reasons.push("Rejeição confirmada com fechamento dentro da banda.");
    }
  }

  if (closedCandle.high >= bollinger.upper && rsi > 70) {
    isPut = true;
    score += 15;
    evalResult.reasons.push("Preço tocou/excedeu banda superior com RSI sobrecomprado.");
    if (closedCandle.close < bollinger.upper) {
      score += 10;
      evalResult.reasons.push("Rejeição confirmada com fechamento dentro da banda.");
    }
  }

  // Combine signals
  if (sweepBullish || srBullish) {
    isCall = true;
    score += 25;
  }
  if (sweepBearish || srBearish) {
    isPut = true;
    score += 25;
  }

  if (isCall && isPut) {
    evalResult.reasons.push("Sinais conflitantes na mesma vela.");
    return evalResult;
  }

  if (isCall) {
    evalResult.signal = 'CALL';
    evalResult.technicalScore = Math.min(100, score);
  } else if (isPut) {
    evalResult.signal = 'PUT';
    evalResult.technicalScore = Math.min(100, score);
  } else {
    evalResult.reasons.push("Nenhuma condição de retração/exaustão encontrada.");
  }

  return evalResult;
}
