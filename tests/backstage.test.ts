import test from 'node:test';
import assert from 'node:assert';
import { calculateReplayEconomicMetrics, getExpectedExpiryMs, runBackstageReplay, validateReplayPayout } from '../server/backstageReplay';
import { resetCalibrationSession, calibrateProbability, registerTradeResult } from '../server/calibration';
import { evaluateOrderBlock } from '../server/triggers/orderBlock';
import { evaluateLiquiditySweep } from '../server/triggers/liquiditySweep';
import { evaluateFairValueGap } from '../server/triggers/fairValueGap';
import { aggregateM1ToM5Strict } from '../server/dataSources/fastForex/fastForexCandles';
import { Candle } from '../server/types';

function makeM1(i: number, open: number, high: number, low: number, close: number): any {
    return {
        timestamp: 1700000100000 + i * 60000,
        time: new Date(1700000100000 + i * 60000).toISOString(),
        open, high, low, close, volume: 100, complete: true, source: "synthetic_fallback" as const, provider: "synthetic" as const,
        ema9: close, sma21: close, atr: 0.001,
        instrument: "EUR_USD", granularity: "M1", priceType: "mid"
    };
}

function makeReplayCandles(length = 300): Candle[] {
    let price = 1.1000;
    return Array.from({length}, (_, i) => {
          let open = price;
          let change = 0;
          if (i < 50) {
            change = 0.0050;
          } else if (i < 100) {
            change = -0.0050;
          } else {
            change = 0.0004 + 0.0005 * Math.sin(i * 0.15);
          }
          let close = price + change;
          let noise = (Math.sin(i * 1.5) + Math.cos(i * 2.3)) * 0.00005;
          let high = Math.max(open, close) + 0.0001 + Math.abs(noise);
          let low = Math.min(open, close) - 0.0001 - Math.abs(noise);
          price = close + noise;

          return makeM1(i, open, high, low, close);
    });
}

function toM5(candles: Candle[]): Candle[] {
    return candles.map((c, i) => ({
        ...c,
        timestamp: 1700000100000 + i * 300000,
        time: new Date(1700000100000 + i * 300000).toISOString(),
        granularity: "M5"
    }));
}

test('SMC Triggers', (t) => {
    // 1. Order Block Test
    const baseCandlesOB = Array(15).fill([100, 105, 95, 100]); 
    const obSetup = [
        [105, 105, 95, 95], // Bearish OB candle
        [95, 120, 95, 120], // Bullish Impulse
    ];
    let c1 = [...baseCandlesOB, ...obSetup, [120, 125, 115, 120]].map((c, i) => makeM1(i, c[0], c[1], c[2], c[3]));
    let res = evaluateOrderBlock({ candles: c1, currentPrice: 120 } as any, 'trend');
    assert.strictEqual(res.signal, 'NEUTRAL', 'Sem reteste = NEUTRAL');

    let c3 = [...baseCandlesOB, ...obSetup, [110, 115, 100, 112]].map((c, i) => makeM1(i, c[0], c[1], c[2], c[3]));
    res = evaluateOrderBlock({ candles: c3, currentPrice: 112 } as any, 'trend');
    assert.strictEqual(res.signal, 'CALL', 'Bullish OB Reteste + Confirmação = CALL');

    // 2. Liquidity Sweep Test
    const baseCandlesLS = Array(25).fill([100, 105, 95, 100]); 
    let ls1 = [...baseCandlesLS, [100, 100, 90, 90]].map((c, i) => makeM1(i, c[0], c[1], c[2], c[3]));
    res = evaluateLiquiditySweep({ candles: ls1, currentPrice: 90 } as any, 'trend');
    assert.strictEqual(res.signal, 'NEUTRAL', 'Breakout sem rejeição = NEUTRAL');

    let ls2 = [...baseCandlesLS, [100, 100, 90, 101]].map((c, i) => makeM1(i, c[0], c[1], c[2], c[3]));
    res = evaluateLiquiditySweep({ candles: ls2, currentPrice: 101 } as any, 'trend');
    assert.strictEqual(res.signal, 'CALL', 'Sweep de fundo com rejeição = CALL');

    // 3. FVG Test
    const baseCandlesFVG = Array(7).fill([100, 105, 95, 100]); 
    const fvgSetup = [
        [100, 110, 100, 110], // c1
        [110, 125, 110, 125], // c2
        [125, 130, 115, 130]  // c3 => GAP is 110 to 115
    ];
    let fvg3 = [...baseCandlesFVG, ...fvgSetup, [120, 125, 112, 122]].map((c, i) => makeM1(i, c[0], c[1], c[2], c[3]));
    res = evaluateFairValueGap({ candles: fvg3, currentPrice: 122 } as any, 'trend');
    assert.strictEqual(res.signal, 'CALL', 'FVG Mitigado + Rejeitado = CALL');
});

test('M5 Strict Aggregation', (t) => {
    // 5 complete consecutive candles
    let m1 = [
        makeM1(0, 100, 105, 95, 102),
        makeM1(1, 102, 110, 100, 108),
        makeM1(2, 108, 109, 105, 106),
        makeM1(3, 106, 115, 106, 112),
        makeM1(4, 112, 112, 100, 101)
    ];
    let { candles } = aggregateM1ToM5Strict(m1);
    assert.strictEqual(candles.length, 1, 'Deve agregar 5 velas M1 em 1 M5');
    assert.strictEqual(candles[0].high, 115);
    assert.strictEqual(candles[0].low, 95);

    // Missing one candle (gap)
    m1 = [
        makeM1(0, 100, 105, 95, 102),
        makeM1(1, 102, 110, 100, 108),
        makeM1(3, 106, 115, 106, 112),
        makeM1(4, 112, 112, 100, 101),
        makeM1(5, 112, 112, 100, 101)
    ];
    let res = aggregateM1ToM5Strict(m1);
    assert.strictEqual(res.candles.length, 0, 'Gap no M1 deve descartar o bloco M5');

    // Incomplete candle
    m1 = [
        makeM1(0, 100, 105, 95, 102),
        makeM1(1, 102, 110, 100, 108),
        makeM1(2, 108, 109, 105, 106),
        makeM1(3, 106, 115, 106, 112),
        { ...makeM1(4, 112, 112, 100, 101), complete: false }
    ];
    res = aggregateM1ToM5Strict(m1);
    assert.strictEqual(res.candles.length, 0, 'Vela incompleta no bloco deve descartar o M5');
});

test('Calibration and Backstage Replay Deadlock / Freeze', (t) => {
    resetCalibrationSession();
    const asset = "EUR/USD", timeframe = "M1", strategy = "trend", regime = "trend", engineVersion = "v1";
    
    registerTradeResult(asset, timeframe, strategy, regime, engineVersion, "WIN");
    let cal = calibrateProbability(asset, timeframe, strategy, regime, engineVersion, 80);
    
    assert.strictEqual(cal.sampleSize, 1);
    assert.strictEqual(cal.historicalWinRate, 100);
    assert.strictEqual(cal.calibratedProbability, null, 'Deve usar null quando histórico é insuficiente');

    for (let i = 0; i < 30; i++) registerTradeResult(asset, timeframe, strategy, regime, engineVersion, "WIN");
    cal = calibrateProbability(asset, timeframe, strategy, regime, engineVersion, 80);
    
    assert.strictEqual(cal.sampleSize, 31);
    assert.strictEqual(cal.historicalWinRate, 100);
    assert.strictEqual(cal.calibratedProbability, 94, 'Raw prob 100 * 0.7 + 80 * 0.3 = 94');
});

test('Dataset Hashing', (t) => {
    // Generate trending candles that actually trigger a signal
    const candles1 = makeReplayCandles();

    const candles2 = JSON.parse(JSON.stringify(candles1));
    candles2[50].close = candles2[50].close + 0.0010; // change one candle
    
    // Reset state before running
    const res1 = runBackstageReplay({ asset: "EUR/USD", timeframe: "M1", strategy: "all", candles: candles1 });
    
    const res2 = runBackstageReplay({ asset: "EUR/USD", timeframe: "M1", strategy: "all", candles: candles2 });
    assert.notStrictEqual(res1.datasetHash, res2.datasetHash, 'Mudança no OHLC deve gerar hash diferente');
    
    const res3 = runBackstageReplay({ asset: "EUR/USD", timeframe: "M1", strategy: "all", candles: candles1 });
    assert.strictEqual(res1.datasetHash, res3.datasetHash, 'Execuções idênticas retornam mesmos hashes');
    
    // Verify that at least 1 CALL or PUT was generated
    assert.ok(res1.results.length > 0, "O dataset deve gerar pelo menos 1 sinal decidido para validar o determinismo completo.");
});

function assertBackstageReplayNextCandlePricingAndExpiry(timeframe: "M1" | "M5", candles: Candle[], expectedExpiryMs: number) {
    const replay = runBackstageReplay({ asset: "EUR/USD", timeframe, strategy: "all", candles });

    assert.ok(replay.results.length > 0, `dataset must generate ${timeframe} validation signals`);
    const signal = replay.results[0];
    const signalIndex = candles.findIndex(c => c.time === signal.timestamp);
    const nextCandle = candles[signalIndex + 1];

    assert.ok(nextCandle, "signal must have a next candle");
    assert.strictEqual(signal.entryPrice, nextCandle.open);
    assert.strictEqual(signal.exitPrice, nextCandle.close);
    assert.strictEqual(signal.entryTimestamp, nextCandle.time);
    assert.strictEqual(
        new Date(signal.expiryTimestamp).getTime() - new Date(signal.entryTimestamp).getTime(),
        expectedExpiryMs
    );
}

test('Backstage replay M1 uses next candle prices and expires exactly 60 seconds after entry', () => {
    assertBackstageReplayNextCandlePricingAndExpiry("M1", makeReplayCandles(), 60000);
});

test('Backstage replay M5 uses next candle prices and expires exactly 300 seconds after entry', () => {
    assertBackstageReplayNextCandlePricingAndExpiry("M5", toM5(makeReplayCandles()), 300000);
});

test('Backstage replay rejects M1 expiry gaps without calculating validation result', () => {
    const candles = makeReplayCandles();
    const baseline = runBackstageReplay({ asset: "EUR/USD", timeframe: "M1", strategy: "all", candles });
    const firstSignal = baseline.results[0];
    assert.ok(firstSignal, "baseline must generate at least one validation signal");

    const signalIndex = candles.findIndex(c => c.time === firstSignal.timestamp);
    const gappedCandles = candles.map(c => ({ ...c }));
    const gappedEntry = gappedCandles[signalIndex + 1];
    gappedEntry.timestamp += 60000;
    gappedEntry.time = new Date(gappedEntry.timestamp).toISOString();

    const replay = runBackstageReplay({ asset: "EUR/USD", timeframe: "M1", strategy: "all", candles: gappedCandles });

    assert.ok(replay.invalidExpiryGaps >= 1);
    assert.ok(replay.invalidExpiryGapEvents.some(e =>
        e.reason === "INVALID_EXPIRY_GAP" &&
        e.expectedMs === getExpectedExpiryMs("M1") &&
        e.actualMs !== getExpectedExpiryMs("M1")
    ));
    assert.ok(!replay.results.some(r => r.timestamp === firstSignal.timestamp && r.result));
});

test('Backstage replay rejects M5 expiry gaps without calculating validation result', () => {
    const candles = toM5(makeReplayCandles());
    const baseline = runBackstageReplay({ asset: "EUR/USD", timeframe: "M5", strategy: "all", candles });
    const firstSignal = baseline.results[0];
    assert.ok(firstSignal, "baseline must generate at least one validation signal");

    const signalIndex = candles.findIndex(c => c.time === firstSignal.timestamp);
    const gappedCandles = candles.map(c => ({ ...c }));
    const gappedEntry = gappedCandles[signalIndex + 1];
    gappedEntry.timestamp += 300000;
    gappedEntry.time = new Date(gappedEntry.timestamp).toISOString();

    const replay = runBackstageReplay({ asset: "EUR/USD", timeframe: "M5", strategy: "all", candles: gappedCandles });

    assert.ok(replay.invalidExpiryGaps >= 1);
    assert.ok(replay.invalidExpiryGapEvents.some(e =>
        e.reason === "INVALID_EXPIRY_GAP" &&
        e.expectedMs === getExpectedExpiryMs("M5") &&
        e.actualMs !== getExpectedExpiryMs("M5")
    ));
    assert.ok(!replay.results.some(r => r.timestamp === firstSignal.timestamp && r.result));
});

test('Future candle changes do not alter earlier historical replay decisions', () => {
    const candles = makeReplayCandles(360);
    const baseline = runBackstageReplay({ asset: "EUR/USD", timeframe: "M1", strategy: "all", candles });
    assert.ok(baseline.results.length > 0, "baseline must generate validation signals");

    const cutoffIndex = 280;
    const cutoffTimestamp = candles[cutoffIndex].timestamp!;
    const modified = candles.map((c, i) => i > cutoffIndex ? ({
        ...c,
        open: c.open + 0.05,
        high: c.high + 0.05,
        low: c.low + 0.05,
        close: c.close + 0.05
    }) : ({ ...c }));

    const replay = runBackstageReplay({ asset: "EUR/USD", timeframe: "M1", strategy: "all", candles: modified });
    const beforeCutoff = (r: any) => new Date(r.timestamp).getTime() < cutoffTimestamp;
    const normalize = (r: any) => ({
        timestamp: r.timestamp,
        strategy: r.strategy,
        signal: r.signal,
        entryPrice: r.entryPrice,
        exitPrice: r.exitPrice,
        result: r.result
    });

    assert.deepStrictEqual(
        baseline.results.filter(beforeCutoff).map(normalize),
        replay.results.filter(beforeCutoff).map(normalize)
    );
});

test('Validation results do not increase calibration sampleSize', () => {
    const replay = runBackstageReplay({ asset: "EUR/USD", timeframe: "M1", strategy: "all", candles: makeReplayCandles(360) });

    assert.ok(replay.results.length > 1, "dataset must generate multiple validation signals");
    assert.ok(replay.results.every(r => (r.sampleSize ?? 0) <= replay.trainSignals));

    const sampleSizes = replay.results
        .map(r => r.sampleSize)
        .filter((sampleSize): sampleSize is number => typeof sampleSize === "number");

    assert.deepStrictEqual(sampleSizes, [...sampleSizes].sort((a, b) => a - b));
});


test('Replay economic metrics use payout 0.80 with normalized binary-options stake', () => {
    const metrics = calculateReplayEconomicMetrics([
        { result: "WIN" },
        { result: "WIN" },
        { result: "LOSS" },
        { result: "DRAW" }
    ], 0.80);

    assert.strictEqual(metrics.economicMetricsAvailable, true);
    assert.strictEqual(metrics.economicStatus, "ECONOMICALLY_PROFITABLE");
    assert.strictEqual(metrics.payout, 0.80);
    assert.strictEqual(metrics.breakEvenWinRate, 1 / 1.8);
    assert.strictEqual(metrics.grossProfit, 1.6);
    assert.strictEqual(metrics.grossLoss, 1);
    assert.strictEqual(metrics.netProfit, 0.6000000000000001);
    assert.strictEqual(metrics.roiPercent, 20.000000000000004);
    assert.strictEqual(metrics.expectedValuePerTrade, 0.20000000000000004);
    assert.strictEqual(metrics.profitable, true);
    assert.strictEqual(metrics.decidedTrades, 3);
    assert.strictEqual(metrics.draws, 1);
});

test('Replay economic metrics use payout 0.70 and can change profitability for same win rate', () => {
    const sameWinRateResults = [
        { result: "WIN" as const },
        { result: "WIN" as const },
        { result: "WIN" as const },
        { result: "WIN" as const },
        { result: "LOSS" as const },
        { result: "LOSS" as const },
        { result: "LOSS" as const }
    ];

    const payout080 = calculateReplayEconomicMetrics(sameWinRateResults, 0.80);
    const payout070 = calculateReplayEconomicMetrics(sameWinRateResults, 0.70);

    assert.strictEqual(payout070.payout, 0.70);
    assert.strictEqual(payout070.breakEvenWinRate, 1 / 1.7);
    assert.strictEqual(payout080.netProfit, 0.20000000000000018);
    assert.strictEqual(payout080.profitable, true);
    assert.strictEqual(payout080.economicStatus, "ECONOMICALLY_PROFITABLE");
    assert.strictEqual(payout070.grossProfit, 2.8);
    assert.strictEqual(payout070.grossLoss, 3);
    assert.strictEqual(payout070.netProfit, -0.20000000000000018);
    assert.strictEqual(payout070.roiPercent, -2.85714285714286);
    assert.strictEqual(payout070.expectedValuePerTrade, -0.028571428571428598);
    assert.strictEqual(payout070.profitable, false);
    assert.strictEqual(payout070.economicStatus, "ECONOMICALLY_UNPROFITABLE");
    assert.strictEqual(payout070.decidedTrades, 7);
});

test('Replay economic metrics count DRAW with zero financial result', () => {
    const metrics = calculateReplayEconomicMetrics([
        { result: "WIN" },
        { result: "DRAW" },
        { result: "LOSS" },
        { result: "DRAW" }
    ], 1);

    assert.strictEqual(metrics.grossProfit, 1);
    assert.strictEqual(metrics.grossLoss, 1);
    assert.strictEqual(metrics.netProfit, 0);
    assert.strictEqual(metrics.decidedTrades, 2);
    assert.strictEqual(metrics.draws, 2);
    assert.strictEqual(metrics.expectedValuePerTrade, 0);
});

test('Replay economic metrics are unavailable when payout is absent', () => {
    const metrics = calculateReplayEconomicMetrics([{ result: "WIN" }, { result: "LOSS" }]);

    assert.strictEqual(metrics.economicMetricsAvailable, false);
    assert.strictEqual(metrics.economicStatus, "ECONOMIC_METRICS_UNAVAILABLE");
    assert.strictEqual(metrics.payout, null);
    assert.strictEqual(metrics.breakEvenWinRate, null);
    assert.strictEqual(metrics.grossProfit, null);
    assert.strictEqual(metrics.grossLoss, null);
    assert.strictEqual(metrics.netProfit, null);
    assert.strictEqual(metrics.roiPercent, null);
    assert.strictEqual(metrics.expectedValuePerTrade, null);
    assert.strictEqual(metrics.profitable, null);
    assert.strictEqual(metrics.decidedTrades, 2);
    assert.strictEqual(metrics.draws, 0);
});

test('Replay payout validation rejects values below 0 or above 1', () => {
    assert.throws(() => validateReplayPayout(-0.01), /INVALID_PAYOUT/);
    assert.throws(() => validateReplayPayout(1.01), /INVALID_PAYOUT/);
    assert.strictEqual(validateReplayPayout(0), 0);
    assert.strictEqual(validateReplayPayout(1), 1);
    assert.strictEqual(validateReplayPayout(undefined), undefined);
});

test('Payout does not change replay decisions or directional hashes', () => {
    const candles = makeReplayCandles(360);
    const replay = runBackstageReplay({ asset: "EUR/USD", timeframe: "M1", strategy: "all", candles });
    const baselineHash = replay.resultsHash;
    const baselineDecisions = replay.results.map(r => ({
        timestamp: r.timestamp,
        strategy: r.strategy,
        signal: r.signal,
        entryPrice: r.entryPrice,
        exitPrice: r.exitPrice,
        result: r.result
    }));

    const metrics = calculateReplayEconomicMetrics(replay.results, 0.80);
    const replayAfterEconomicMetrics = runBackstageReplay({ asset: "EUR/USD", timeframe: "M1", strategy: "all", candles });

    assert.strictEqual(metrics.economicMetricsAvailable, true);
    assert.strictEqual(replayAfterEconomicMetrics.resultsHash, baselineHash);
    assert.deepStrictEqual(replayAfterEconomicMetrics.results.map(r => ({
        timestamp: r.timestamp,
        strategy: r.strategy,
        signal: r.signal,
        entryPrice: r.entryPrice,
        exitPrice: r.exitPrice,
        result: r.result
    })), baselineDecisions);
});
