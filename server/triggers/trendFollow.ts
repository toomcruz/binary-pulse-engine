import { MarketFeatures, RegimeLabel, TriggerEvaluation, Candle } from '../types';

export function evaluateTrendFollow(features: MarketFeatures, regime: RegimeLabel): TriggerEvaluation {
  const { indicators, closedCandle, candles = [], timeframe } = features;
  const { rsi, ema9, sma21, macd, atr } = indicators;
  const currentPrice = closedCandle.close;
  
  const evalResult: TriggerEvaluation = {
    strategy: 'trendFollow',
    signal: 'NEUTRAL',
    technicalScore: 0,
    reasons: []
  };

  if (regime !== 'trend') {
    evalResult.reasons.push("Regime incompatível (Mercado não está em tendência clara)");
    return evalResult;
  }

  // Volatility Filter (ATR low blocks, ATR extreme blocks)
  const relativeAtr = atr / currentPrice;
  if (relativeAtr < 0.00008) {
    evalResult.reasons.push("FILTRO: Volatilidade muito baixa para seguidor de tendência.");
    return evalResult;
  }

  if (rsi > 75 || rsi < 25) {
    evalResult.reasons.push("RSI extremamente esticado (risco de exaustão)");
    return evalResult;
  }

  let isCall = false;
  let isPut = false;
  let score = 50;

  // 1. ORDER BLOCK / BOS DETECTION
  let orderBlockBullish = false;
  let orderBlockBearish = false;

  if (candles.length >= 20) {
    const prevCandles = candles.slice(-20, -1);
    // Local structures
    const localHighs = prevCandles.map(c => c.high);
    const localLows = prevCandles.map(c => c.low);
    const prevMax = Math.max(...localHighs.slice(-15, -2));
    const prevMin = Math.min(...localLows.slice(-15, -2));

    // BOS: Break of Structure
    const hasBullishBOS = closedCandle.close > prevMax;
    const hasBearishBOS = closedCandle.close < prevMin;

    if (hasBullishBOS) {
      evalResult.reasons.push("BOS de Alta (Rompimento de Estrutura anterior de Topo) confirmado.");
      // Bullish Order Block: last bearish candle before expansion
      let obIndex = -1;
      for (let k = prevCandles.length - 1; k >= 0; k--) {
        if (prevCandles[k].close < prevCandles[k].open) {
          obIndex = k;
          break;
        }
      }
      if (obIndex !== -1) {
        const obCandle = prevCandles[obIndex];
        // Retest: current price touches the obCandle range and rejects (lower shadow)
        const inObRange = closedCandle.low <= obCandle.high && closedCandle.close >= obCandle.low;
        const bodySize = Math.abs(closedCandle.close - closedCandle.open);
        const lowerShadow = Math.min(closedCandle.open, closedCandle.close) - closedCandle.low;
        
        if (inObRange && lowerShadow > bodySize * 0.5) {
          orderBlockBullish = true;
          evalResult.reasons.push("Sinal de Order Block: Reteste e rejeição de pavio na zona do bloco comprador.");
        }
      }
    }

    if (hasBearishBOS) {
      evalResult.reasons.push("BOS de Baixa (Rompimento de Estrutura anterior de Fundo) confirmado.");
      // Bearish Order Block: last bullish candle before expansion
      let obIndex = -1;
      for (let k = prevCandles.length - 1; k >= 0; k--) {
        if (prevCandles[k].close > prevCandles[k].open) {
          obIndex = k;
          break;
        }
      }
      if (obIndex !== -1) {
        const obCandle = prevCandles[obIndex];
        // Retest: price touches the obCandle range and rejects (upper shadow)
        const inObRange = closedCandle.high >= obCandle.low && closedCandle.close <= obCandle.high;
        const bodySize = Math.abs(closedCandle.close - closedCandle.open);
        const upperShadow = closedCandle.high - Math.max(closedCandle.open, closedCandle.close);
        
        if (inObRange && upperShadow > bodySize * 0.5) {
          orderBlockBearish = true;
          evalResult.reasons.push("Sinal de Order Block: Reteste e rejeição de pavio na zona do bloco vendedor.");
        }
      }
    }
  }

  // 2. TREND FILTER (EMA alignment & M5 trend if timeframe is M1)
  let trendAlignedCall = false;
  let trendAlignedPut = false;

  if (timeframe === "M1" && candles.length >= 10) {
    // Determine macro trend by evaluating moving averages over a longer period
    const last10 = candles.slice(-10);
    const greenCount = last10.filter(c => c.close > c.open).length;
    if (greenCount >= 6 && ema9 > sma21) {
      trendAlignedCall = true;
    } else if (greenCount <= 4 && ema9 < sma21) {
      trendAlignedPut = true;
    }
  } else {
    trendAlignedCall = ema9 > sma21;
    trendAlignedPut = ema9 < sma21;
  }

  // Standard indicator confirmations
  if (trendAlignedCall && macd.line > macd.signal && macd.histogram > 0) {
    if (closedCandle.close > ema9 && closedCandle.close > closedCandle.open) {
      isCall = true;
      score += 25;
      evalResult.reasons.push("Alinhamento de alta (EMA9 > SMA21) com MACD positivo.");
      if (closedCandle.low <= ema9) {
        score += 15;
        evalResult.reasons.push("Pullback bem-sucedido na EMA9.");
      }
    }
  }

  if (trendAlignedPut && macd.line < macd.signal && macd.histogram < 0) {
    if (closedCandle.close < ema9 && closedCandle.close < closedCandle.open) {
      isPut = true;
      score += 25;
      evalResult.reasons.push("Alinhamento de baixa (EMA9 < SMA21) com MACD negativo.");
      if (closedCandle.high >= ema9) {
        score += 15;
        evalResult.reasons.push("Pullback bem-sucedido na EMA9.");
      }
    }
  }

  // Inject Order Block signal strength
  if (orderBlockBullish && trendAlignedCall) {
    isCall = true;
    score += 35;
  }
  if (orderBlockBearish && trendAlignedPut) {
    isPut = true;
    score += 35;
  }

  if (isCall && !isPut) {
    evalResult.signal = 'CALL';
    evalResult.technicalScore = Math.min(100, score);
  } else if (isPut && !isCall) {
    evalResult.signal = 'PUT';
    evalResult.technicalScore = Math.min(100, score);
  } else {
    evalResult.reasons.push("Condições de continuação não atendidas perfeitamente.");
  }

  return evalResult;
}
