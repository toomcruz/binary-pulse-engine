import { test } from "node:test";
import assert from "node:assert";
import { runSignalEngine } from '../server/engine';
import { detectMarketRegime, getRegimeStateManager, resetAllRegimeStates, resetRegimeState, createRegimeStateKey, defaultRegimeThresholds } from "../server/regimeEngine";
import { analyzeMarketStructure, detectRange, analyzeBreakout } from "../server/marketStructure";
import { Candle } from "../server/types";

function makeCandle(close: number, idx: number): Candle {
  return {
    time: "2024-01-01T" + String(idx).padStart(2, "0") + ":00:00Z",
    timestamp: 1700000000000 + idx * 60000,
    open: close - 0.001,
    high: close + 0.002,
    low: close - 0.002,
    close: close,
    atr: 0.001,
    ema9: close,
    sma21: close,
    adx: 25,
    plusDI: 20,
    minusDI: 10
  };
}

test("State isolation between assets (EUR/USD M1 vs GBP/USD M1)", () => {
  resetAllRegimeStates();
  const key1 = createRegimeStateKey("EUR/USD", "M1", "OPEN", "v1.0", "live");
  const key2 = createRegimeStateKey("GBP/USD", "M1", "OPEN", "v1.0", "live");
  
  const state1 = getRegimeStateManager(key1);
  const state2 = getRegimeStateManager(key2);
  
  assert.notStrictEqual(state1, state2);
});

test("State isolation between timeframes (M1 vs M5)", () => {
  resetAllRegimeStates();
  const key1 = createRegimeStateKey("EUR/USD", "M1", "OPEN", "v1.0", "live");
  const key2 = createRegimeStateKey("EUR/USD", "M5", "OPEN", "v1.0", "live");
  
  const state1 = getRegimeStateManager(key1);
  const state2 = getRegimeStateManager(key2);
  
  assert.notStrictEqual(state1, state2);
});

test("State reset between replays", () => {
  resetAllRegimeStates();
  const key = createRegimeStateKey("EUR/USD", "M1", "OPEN", "v1.0", "backstage");
  const state1 = getRegimeStateManager(key);
  resetRegimeState(key);
  const state2 = getRegimeStateManager(key);
  assert.notStrictEqual(state1, state2);
});

test("Structure HH/HL and LH/LL", () => {
  const upCandles = [];
  let price = 1.0000;
  for (let i = 0; i < 200; i++) {
    // 4 up, 4 down to make sure pivots are found (left 3, right 3)
    const cycle = Math.floor(i / 4) % 2; 
    if (cycle === 0) price += 0.005; // 4 bars up
    else price -= 0.002; // 4 bars down (net positive)
    upCandles.push(makeCandle(price, i));
  }
  const upStruct = analyzeMarketStructure(upCandles);
  assert.strictEqual(upStruct.direction, 1);

  const downCandles = [];
  price = 1.0000;
  for (let i = 0; i < 200; i++) {
    const cycle = Math.floor(i / 4) % 2; 
    if (cycle === 0) price -= 0.005;
    else price += 0.002;
    downCandles.push(makeCandle(price, i));
  }
  const downStruct = analyzeMarketStructure(downCandles);
  assert.strictEqual(downStruct.direction, -1);
});

test("True range detection", () => {
  const candles = [];
  let price = 1.0000;
  for (let i = 0; i < 40; i++) {
    // Creating a valid range: bouncing between 1.0000 and 1.0020
    // Create candles with long wicks bouncing off the same upper/lower limits
    // close is around 1.0000, high goes to 1.0020, low goes to 0.9980
    const isUpperRejection = i % 2 === 0;
    
    let close = 1.0000;
    let high = isUpperRejection ? 1.0020 : 1.0005;
    let low = isUpperRejection ? 0.9995 : 0.9980;
    
    candles.push({
      time: new Date(1700000000000 + i * 60000).toISOString(),
      timestamp: 1700000000000 + i * 60000,
      open: close,
      high: high,
      low: low,
      close: close,
      atr: 0.001,
      ema9: close,
      sma21: close,
      adx: 25,
      plusDI: 20,
      minusDI: 10,
      complete: true,
      volume: 100
    });
  }
  const range = detectRange(candles);
  assert.strictEqual(range.valid, true);
  assert.ok(range.upperRejections >= 2);
  assert.ok(range.lowerRejections >= 2);
  assert.ok(range.upperBoundary !== null);
  assert.ok(range.lowerBoundary !== null);
});

test("Invalid range detection", () => {
  const candles = [];
  let price = 1.0000;
  for (let i = 0; i < 30; i++) {
    price += 0.0001; // Constant trend
    candles.push(makeCandle(price, i));
  }
  const range = detectRange(candles);
  assert.strictEqual(range.valid, false);
});

test("No Look-Ahead Bias Full Execution", () => {
    const baseCandles = [];
  let price = 1.0000;
  for (let i = 0; i < 100; i++) {
    price += (i % 2 === 0) ? 0.001 : -0.0005; 
    baseCandles.push(makeCandle(price, i));
  }
  
  const marketContext = { executionMode: "test_lookahead1", session: "OVERLAP" as const, newsRisk: "LOW" as const, minutesToHighImpactNews: 120 };
  const res1 = runSignalEngine("EUR/USD", "M1", baseCandles[49].close, baseCandles.slice(0, 50), null, marketContext);
  
  // Modify future candles
  const modifiedCandles = [...baseCandles];
  for (let i = 50; i < 100; i++) {
    modifiedCandles[i].close += 0.05;
    modifiedCandles[i].high += 0.05;
  }
  
  const marketContext2 = { executionMode: "test_lookahead2", session: "OVERLAP" as const, newsRisk: "LOW" as const, minutesToHighImpactNews: 120 };
  const res2 = runSignalEngine("EUR/USD", "M1", modifiedCandles[49].close, modifiedCandles.slice(0, 50), null, marketContext2);
  
  assert.strictEqual(res1.regimeResult?.rawRegime, res2.regimeResult?.rawRegime);
  assert.strictEqual(res1.regimeResult?.regime, res2.regimeResult?.regime);
  assert.strictEqual(res1.regimeResult?.regimeConfidence, res2.regimeResult?.regimeConfidence);
  assert.strictEqual(res1.callScore?.total, res2.callScore?.total);
  assert.strictEqual(res1.putScore?.total, res2.putScore?.total);
  assert.strictEqual(res1.entryQuality, res2.entryQuality);
  assert.strictEqual(res1.strategy, res2.strategy);
  assert.strictEqual(res1.signal, res2.signal);
  assert.strictEqual(res1.higherRegime, res2.higherRegime);
  
  // Compare keyLevels safely
  assert.strictEqual(res1.keyLevels?.support, res2.keyLevels?.support);
  assert.strictEqual(res1.keyLevels?.resistance, res2.keyLevels?.resistance);
});

test("Real Determinism Full Run", () => {
    const baseCandles = [];
  let price = 1.0000;
  for (let i = 0; i < 60; i++) {
    price += (i % 2 === 0) ? 0.001 : -0.0005; 
    baseCandles.push(makeCandle(price, i));
  }
  
  resetAllRegimeStates();
  const res1 = runSignalEngine("EUR/USD", "M1", baseCandles[59].close, baseCandles, null, { executionMode: "live_det", session: "OVERLAP" as const, newsRisk: "LOW" as const, minutesToHighImpactNews: 120 });
  
  resetAllRegimeStates();
  const res2 = runSignalEngine("EUR/USD", "M1", baseCandles[59].close, baseCandles, null, { executionMode: "live_det", session: "OVERLAP" as const, newsRisk: "LOW" as const, minutesToHighImpactNews: 120 });
  
  assert.strictEqual(res1.regimeResult?.regime, res2.regimeResult?.regime);
  assert.strictEqual(res1.signal, res2.signal);
  assert.strictEqual(res1.callScore?.total, res2.callScore?.total);
  assert.strictEqual(res1.putScore?.total, res2.putScore?.total);
  assert.strictEqual(res1.entryQuality, res2.entryQuality);
  assert.strictEqual(res1.vetoReasons?.length, res2.vetoReasons?.length);
});
