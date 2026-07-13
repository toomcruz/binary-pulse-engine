import test from 'node:test';
import assert from 'node:assert';
import { runBackstageReplay } from '../server/backstageReplay';
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
    let price = 1.1000;
    const candles1 = Array.from({length: 300}, (_, i) => {
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
