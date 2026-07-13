// Set test environment variables FIRST
process.env.TEST_ENV = "true";
process.env.FASTFOREX_API_KEY = "mock_test_key";
process.env.FASTFOREX_SYMBOLS_FOREX = "EUR/USD,GBP/USD";
process.env.FASTFOREX_SYMBOLS_CRYPTO = "BTC/USD";
// Force Gemini formatter to take the deterministic fallback path (no real API calls in tests).
process.env.GEMINI_API_KEY = "";

import test from 'node:test';
import assert from 'node:assert';
import http from 'http';

const originalFetch = global.fetch;

function setupMockFetch() {
  global.fetch = (async (url: any, init?: any) => {
    const urlStr = String(url);

    if (urlStr.includes("127.0.0.1") || urlStr.includes("localhost")) {
      return originalFetch(url, init);
    }

    if (urlStr.includes("/fetch-one") || urlStr.includes("/fetch-all") || urlStr.includes("/fetch-multi")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          result: {
            USD: 1.0850,
            EUR: 0.9200,
            GBP: 0.7800,
            JPY: 155.50,
            BTC: 62500.0,
            ETH: 3450.0
          },
          updated: new Date().toISOString()
        })
      } as any;
    }

    if (urlStr.includes("/fx/quote")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          quotes: {
            EURUSD: {
              bid: 1.0850,
              ask: 1.0852,
              price: 1.0851,
              timestamp: Date.now() / 1000
            },
            GBPUSD: {
              bid: 1.2850,
              ask: 1.2852,
              price: 1.2851,
              timestamp: Date.now() / 1000
            }
          }
        })
      } as any;
    }

    if (urlStr.includes("/fx/ohlc/time-series") || urlStr.includes("/candles") || urlStr.includes("/time-series") || urlStr.includes("/klines")) {
      const results: Array<{ d: number; o: number; h: number; l: number; c: number; v: number }> = [];
      const now = Math.floor(Date.now() / 300000) * 300000;
      // Generate enough candles to pass the checks
      // FastForex mapper expects { d, o, h, l, c, v }
      for (let i = 0; i < 500; i++) {
        const timestamp = now - (500 - i) * 60000;
        results.push({
          d: timestamp,
          o: 1.0850,
          h: 1.0860,
          l: 1.0840,
          c: 1.0852,
          v: 1000
        });
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          results
        })
      } as any;
    }

    return originalFetch(url, init);
  }) as any;
}

function restoreFetch() {
  global.fetch = originalFetch;
}

test("API Integration Tests", async (t) => {
  setupMockFetch();

  // Import app dynamically after setting environment variables
  const { app } = await import('../server');
  
  const server = http.createServer(app);
  await new Promise<void>((resolve) => {
    server.listen(0, () => resolve());
  });
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  await t.test("1. GET /api/market/latest-price - Success and Missing Symbol", async () => {
    // Missing symbol should return 400
    const errRes = await fetch(`${baseUrl}/api/market/latest-price`);
    assert.strictEqual(errRes.status, 400);
    const errData = await errRes.json();
    assert.strictEqual(errData.ok, false);
    assert.strictEqual(errData.error, "MISSING_SYMBOL");

    // Valid symbol should return success
    const successRes = await fetch(`${baseUrl}/api/market/latest-price?symbol=EUR/USD`);
    assert.strictEqual(successRes.status, 200);
    const successData = await successRes.json();
    assert.strictEqual(successData.ok, true);
    assert.strictEqual(successData.symbol, "EUR/USD");
    assert.strictEqual(typeof successData.price, "number");
  });

  await t.test("2. GET /api/market/candles - Timeframes and limits", async () => {
    // Limits validation
    const successRes = await fetch(`${baseUrl}/api/market/candles?symbol=EUR/USD&timeframe=M5&limit=50`);
    assert.strictEqual(successRes.status, 200);
    const successData = await successRes.json();
    console.log("SUCCESS_DATA:", JSON.stringify(successData));
    assert.strictEqual(successData.ok, true);
    assert.strictEqual(successData.timeframe, "M5");
    assert.ok(Array.isArray(successData.candles));
  });

  await t.test("3. POST /api/analyze-market - executionMode validation", async () => {
    // Invalid executionMode should return 400
    const errRes = await fetch(`${baseUrl}/api/analyze-market`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        asset: "EUR/USD",
        timeframe: "M5",
        currentPrice: 1.0850,
        marketContext: {
          executionMode: "invalid_mode_here"
        }
      })
    });
    assert.strictEqual(errRes.status, 400);
    const errData = await errRes.json();
    assert.strictEqual(errData.error, "INVALID_EXECUTION_MODE");

    // Valid executionMode (paper_trading) should work
    const successRes = await fetch(`${baseUrl}/api/analyze-market`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        asset: "EUR/USD",
        timeframe: "M5",
        currentPrice: 1.0850,
        marketContext: {
          executionMode: "paper_trading"
        }
      })
    });
    assert.strictEqual(successRes.status, 200);
  });

  await t.test("4. POST /api/analyze-market - Calibration Gate Thresholds", async () => {
    // Calibration threshold above probability (gate blocks signal)
    const blockedRes = await fetch(`${baseUrl}/api/analyze-market`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        asset: "EUR/USD",
        timeframe: "M5",
        currentPrice: 1.0850,
        calibrationThreshold: 0.95, // extremely high, should force block
        marketContext: {
          executionMode: "paper_trading"
        }
      })
    });
    assert.strictEqual(blockedRes.status, 200);
    const blockedData = await blockedRes.json();
    if (blockedData.signal === "CALL" || blockedData.signal === "PUT") {
      assert.fail("Signal was not blocked by Calibration Gate");
    }
  });

  await t.test("5. POST /api/analyze-market - Invalid Strategy Mode", async () => {
    const errRes = await fetch(`${baseUrl}/api/analyze-market`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        asset: "EUR/USD",
        timeframe: "M5",
        currentPrice: 1.0850,
        strategy: "invalid_strategy_name"
      })
    });
    assert.strictEqual(errRes.status, 400);
    const errData = await errRes.json();
    assert.strictEqual(errData.error, "INVALID_STRATEGY_MODE");
  });

  await new Promise<void>((resolve) => server.close(() => resolve()));
  const { stopFastForexSync } = await import('../server/dataSources/marketDataService');
  stopFastForexSync();
  restoreFetch();
});
