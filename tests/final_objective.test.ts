import test from 'node:test';
import assert from 'node:assert';
import { aggregateStrict, calculateEntryTime } from '../server/utils/aggregator';
import { Candle, MarketContext } from '../server/types';
import { RegimeStateManager, resetAllRegimeStates, createRegimeStateKey, getRegimeStateManager } from '../server/regimeEngine';
import { calculateLevels, calculateCallScore, calculatePutScore } from '../server/decisionScorer';
import { runSignalEngine } from '../server/engine';

function makeCandle(close: number, timestamp: number): Candle {
  return {
    time: new Date(timestamp).toISOString(),
    timestamp,
    open: close,
    high: close + 0.0001,
    low: close - 0.0001,
    close,
    complete: true,
    volume: 100,
    atr: 0.001,
    ema9: close,
    sma21: close,
    adx: 25,
    plusDI: 20,
    minusDI: 10
  };
}

test("Multi-timeframe Aggregator", async (t) => {
  await t.test("5 candles completos -> 1 M5", () => {
    const candles = [
      makeCandle(1, 100000), makeCandle(2, 160000), makeCandle(3, 220000),
      makeCandle(4, 280000), makeCandle(5, 340000)
    ];
    // align to bucket
    candles[0].timestamp = 0; candles[1].timestamp = 60000;
    candles[2].timestamp = 120000; candles[3].timestamp = 180000; candles[4].timestamp = 240000;
    const result = aggregateStrict(candles, 1, 5, 300000);
    assert.strictEqual(result.candles.length, 1);
  });
  await t.test("1 candle incompleto -> 0 M5", () => {
    const candles = [
      makeCandle(1, 0), makeCandle(2, 60000), makeCandle(3, 120000),
      makeCandle(4, 180000), makeCandle(5, 240000)
    ];
    candles[4].complete = false;
    const result = aggregateStrict(candles, 1, 5, 300000);
    assert.strictEqual(result.candles.length, 0);
  });
  await t.test("gap -> 0 M5", () => {
    const candles = [
      makeCandle(1, 0), makeCandle(2, 60000), makeCandle(3, 120000),
      makeCandle(4, 180000), makeCandle(5, 300000) // 240000 is missing
    ];
    const result = aggregateStrict(candles, 1, 5, 300000);
    assert.strictEqual(result.candles.length, 0);
  });
});

test("Key Levels", async (t) => {
  await t.test("ausência de suporte/resistência", () => {
     const candles = [];
     let p = 1.0;
     for (let i = 0; i < 300; i++) {
        p += 0.0001; // Constant trend, no pivots
        candles.push(makeCandle(p, i * 60000));
     }
     const levels = calculateLevels(candles);
     const marketContext: MarketContext = { executionMode: "live", session: "OVERLAP", newsRisk: "LOW", minutesToHighImpactNews: 120 };
     const currentPrice = candles[299].close;
     const callScore = calculateCallScore(candles, null, { rawRegime: "TREND_UP", regime: "TREND_UP", regimeConfidence: 1, trendStrength: 1, directionScore: 1, rangeQuality: 0, multiTimeframeAgreement: 0, multiTimeframeConflict: false, higherRegime: "UNKNOWN" } as any);
     const putScore = calculatePutScore(candles, null, { rawRegime: "TREND_UP", regime: "TREND_UP", regimeConfidence: 1, trendStrength: 1, directionScore: 1, rangeQuality: 0, multiTimeframeAgreement: 0, multiTimeframeConflict: false, higherRegime: "UNKNOWN" } as any);
     
     assert.strictEqual(levels.supportAvailable, false);
     assert.strictEqual(levels.resistanceAvailable, false);
     assert.strictEqual(levels.support, null);
     assert.strictEqual(levels.resistance, null);
     assert.strictEqual(callScore.context, 0);
     assert.strictEqual(putScore.context, 0);
  });
});

test("Hysterese", async (t) => {
  await t.test("histerese mudando corretamente", () => {
    const manager = new RegimeStateManager();
    manager.update({ rawRegime: "TREND_UP", regimeConfidence: 0.8 } as any);
    manager.update({ rawRegime: "RANGE", regimeConfidence: 0.7 } as any);
    manager.update({ rawRegime: "RANGE", regimeConfidence: 0.7 } as any);
    manager.update({ rawRegime: "RANGE", regimeConfidence: 0.7 } as any);
    const finalRes = manager.update({ rawRegime: "RANGE", regimeConfidence: 0.7 } as any);
    assert.strictEqual(finalRes.regime, "RANGE");
  });
});

test("Execution Mode", async (t) => {
  await t.test("isolamento de modos", () => {
     resetAllRegimeStates();
     const k1 = createRegimeStateKey("EUR/USD", "M1", "FOREX", "v1.0", "live");
     const k2 = createRegimeStateKey("EUR/USD", "M1", "FOREX", "v1.0", "paper_trading");
     const k3 = createRegimeStateKey("EUR/USD", "M1", "FOREX", "v1.0", "backstage");
     const k4 = createRegimeStateKey("EUR/USD", "M1", "FOREX", "v1.0", "debug");
     
     const sm1 = getRegimeStateManager(k1);
     const sm2 = getRegimeStateManager(k2);
     const sm3 = getRegimeStateManager(k3);
     const sm4 = getRegimeStateManager(k4);
     
     assert.notStrictEqual(sm1, sm2);
     assert.notStrictEqual(sm1, sm3);
     assert.notStrictEqual(sm1, sm4);
     assert.notStrictEqual(sm2, sm3);
     assert.notStrictEqual(sm2, sm4);
     assert.notStrictEqual(sm3, sm4);
  });
});

test("calculateEntryTime M1 and M5", () => {
  const baseTime = new Date("2026-07-12T10:00:15Z");
  
  // M1 should return the next minute (10:01:00)
  const resultM1 = calculateEntryTime("M1", baseTime);
  assert.strictEqual(resultM1, "2026-07-12T10:01:00.000Z");
  
  // M5 should return the next 5-minute boundary (10:05:00)
  const resultM5 = calculateEntryTime("M5", baseTime);
  assert.strictEqual(resultM5, "2026-07-12T10:05:00.000Z");
  
  // At a boundary, e.g. 10:00:00:
  // M1 should go to 10:01:00
  const boundaryTime = new Date("2026-07-12T10:00:00Z");
  const resultBoundaryM1 = calculateEntryTime("M1", boundaryTime);
  assert.strictEqual(resultBoundaryM1, "2026-07-12T10:01:00.000Z");
  
  // M5 should go to 10:05:00
  const resultBoundaryM5 = calculateEntryTime("M5", boundaryTime);
  assert.strictEqual(resultBoundaryM5, "2026-07-12T10:05:00.000Z");
});
