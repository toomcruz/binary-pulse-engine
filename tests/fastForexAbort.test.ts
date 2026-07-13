import test from 'node:test';
import assert from 'node:assert/strict';

process.env.FASTFOREX_API_KEY = 'test-fastforex-key';
process.env.FASTFOREX_BASE_URL = 'https://fastforex.test';
process.env.NODE_ENV = 'test';

const baseTimestamp = Date.UTC(2024, 0, 1, 0, 0, 0);
const minuteMs = 60_000;

function makeResult(index: number) {
  const price = 1.1 + index / 100_000;
  return {
    d: new Date(baseTimestamp + index * minuteMs).toISOString(),
    o: price,
    h: price + 0.0002,
    l: price - 0.0002,
    c: price + 0.0001,
    v: 100 + index
  };
}

function pageForUrl(input: string | URL | Request, allResults: ReturnType<typeof makeResult>[]) {
  const url = new URL(input.toString());
  const limit = Number(url.searchParams.get('limit') || '100');
  const end = url.searchParams.get('end');
  const endTimestamp = end ? new Date(end).getTime() : Number.POSITIVE_INFINITY;
  const eligible = allResults.filter(result => new Date(result.d).getTime() <= endTimestamp);
  return eligible.slice(Math.max(0, eligible.length - limit));
}

test('fetchWithTimeout cancels an in-flight FastForex request with the external AbortSignal', async () => {
  const originalFetch = globalThis.fetch;
  const controller = new AbortController();
  let fetchSignal: AbortSignal | null = null;

  globalThis.fetch = async (_input: string | URL | Request, init?: RequestInit) => {
    fetchSignal = init?.signal as AbortSignal;
    return await new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    });
  };

  try {
    const { fetchWithTimeout, isFastForexAbortError, isFastForexTimeoutError } = await import('../server/dataSources/fastForex/fetchWithTimeout');
    const promise = fetchWithTimeout('https://fastforex.test/fx/ohlc/time-series', { signal: controller.signal }, 10_000);
    controller.abort();

    await assert.rejects(promise, (error) => {
      assert.equal(isFastForexAbortError(error), true);
      assert.equal(isFastForexTimeoutError(error), false);
      return true;
    });
    assert.equal(fetchSignal?.aborted, true, 'the underlying fetch signal should be aborted');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('fetchWithTimeout classifies external abort with a custom reason as FastForex abort', async () => {
  const originalFetch = globalThis.fetch;
  const controller = new AbortController();

  globalThis.fetch = async (_input: string | URL | Request, init?: RequestInit) => {
    return await new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
    });
  };

  try {
    const { fetchWithTimeout, isFastForexAbortError, isFastForexTimeoutError } = await import('../server/dataSources/fastForex/fetchWithTimeout');
    const promise = fetchWithTimeout('https://fastforex.test/fx/ohlc/time-series', { signal: controller.signal }, 10_000);
    controller.abort(new Error('Backstage scan cancelled'));

    await assert.rejects(promise, (error) => {
      assert.equal(isFastForexAbortError(error), true);
      assert.equal(isFastForexTimeoutError(error), false);
      return true;
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('getBackstageCandles stops between FastForex pages when the scan signal is aborted', async () => {
  const allResults = Array.from({ length: 250 }, (_, index) => makeResult(index));
  const originalFetch = globalThis.fetch;
  const controller = new AbortController();
  const requestedUrls: string[] = [];

  globalThis.fetch = async (input: string | URL | Request) => {
    requestedUrls.push(input.toString());
    const page = pageForUrl(input, allResults);
    return new Response(JSON.stringify({ results: page }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  };

  try {
    const { getBackstageCandles } = await import('../server/dataSources/fastForex/fastForexCandles');
    await assert.rejects(async () => {
      const promise = getBackstageCandles('EUR/USD', 'M1', 200, controller.signal);
      await Promise.resolve();
      controller.abort();
      return promise;
    }, { name: 'FastForexRequestAbortError' });

    assert.equal(requestedUrls.length, 1, 'no new batch should be requested after aborting between pages');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('getBackstageCandles does not start a new FastForex batch after a pre-aborted signal', async () => {
  const originalFetch = globalThis.fetch;
  const controller = new AbortController();
  controller.abort();
  let requestCount = 0;

  globalThis.fetch = async () => {
    requestCount++;
    return new Response(JSON.stringify({ results: [] }), { status: 200 });
  };

  try {
    const { getBackstageCandles } = await import('../server/dataSources/fastForex/fastForexCandles');
    await assert.rejects(getBackstageCandles('EUR/USD', 'M1', 100, controller.signal), { name: 'FastForexRequestAbortError' });
    assert.equal(requestCount, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('fetchWithTimeout still reports the internal FastForex timeout separately from external aborts', async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (_input: string | URL | Request, init?: RequestInit) => {
    return await new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    });
  };

  try {
    const { fetchWithTimeout, isFastForexAbortError, isFastForexTimeoutError } = await import('../server/dataSources/fastForex/fetchWithTimeout');
    await assert.rejects(fetchWithTimeout('https://fastforex.test/fx/ohlc/time-series', {}, 5), (error) => {
      assert.equal(isFastForexTimeoutError(error), true);
      assert.equal(isFastForexAbortError(error), false);
      return true;
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('getBackstageCandles preserves normal FastForex pagination when no signal is supplied', async () => {
  const allResults = Array.from({ length: 150 }, (_, index) => makeResult(index));
  const originalFetch = globalThis.fetch;
  const requestedUrls: string[] = [];

  globalThis.fetch = async (input: string | URL | Request) => {
    requestedUrls.push(input.toString());
    const page = pageForUrl(input, allResults);
    return new Response(JSON.stringify({ results: page }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  };

  try {
    const { getBackstageCandles } = await import('../server/dataSources/fastForex/fastForexCandles');
    const { candles, metrics } = await getBackstageCandles('EUR/USD', 'M1', 150);

    assert.equal(candles.length, 150);
    assert.equal(metrics.batchesFetched, 2);
    assert.equal(requestedUrls.length, 2);
    assert.ok(new URL(requestedUrls[1]).searchParams.has('end'));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('getBackstageCandles preserves MARKET_DATA_ABORTED for external cancellation during Binance pagination', async () => {
  const originalFetch = globalThis.fetch;
  const originalNodeEnv = process.env.NODE_ENV;
  const originalCryptoSymbols = process.env.FASTFOREX_SYMBOLS_CRYPTO;
  process.env.NODE_ENV = 'production';
  process.env.FASTFOREX_SYMBOLS_CRYPTO = 'BTC/USD';
  const controller = new AbortController();

  globalThis.fetch = async (_input: string | URL | Request, init?: RequestInit) => {
    return await new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
      controller.abort();
    });
  };

  try {
    const { getBackstageCandles } = await import('../server/dataSources/fastForex/fastForexCandles');
    await assert.rejects(getBackstageCandles('BTC/USD', 'M1', 2000, controller.signal), (error: any) => {
      assert.equal(error.code, 'MARKET_DATA_ABORTED');
      return true;
    });
  } finally {
    globalThis.fetch = originalFetch;
    process.env.NODE_ENV = originalNodeEnv;
    if (originalCryptoSymbols === undefined) delete process.env.FASTFOREX_SYMBOLS_CRYPTO;
    else process.env.FASTFOREX_SYMBOLS_CRYPTO = originalCryptoSymbols;
  }
});

test('getBackstageCandles preserves MARKET_DATA_TIMEOUT for internal Binance pagination timeout', async () => {
  const originalFetch = globalThis.fetch;
  const originalNodeEnv = process.env.NODE_ENV;
  const originalTimeout = process.env.FASTFOREX_TIMEOUT_MS;
  const originalCryptoSymbols = process.env.FASTFOREX_SYMBOLS_CRYPTO;
  process.env.NODE_ENV = 'production';
  process.env.FASTFOREX_TIMEOUT_MS = '5';
  process.env.FASTFOREX_SYMBOLS_CRYPTO = 'BTC/USD';

  globalThis.fetch = async (_input: string | URL | Request, init?: RequestInit) => {
    return await new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    });
  };

  try {
    const { getBackstageCandles } = await import('../server/dataSources/fastForex/fastForexCandles');
    await assert.rejects(getBackstageCandles('BTC/USD', 'M1', 2000), (error: any) => {
      assert.equal(error.code, 'MARKET_DATA_TIMEOUT');
      return true;
    });
  } finally {
    globalThis.fetch = originalFetch;
    process.env.NODE_ENV = originalNodeEnv;
    if (originalTimeout === undefined) delete process.env.FASTFOREX_TIMEOUT_MS;
    else process.env.FASTFOREX_TIMEOUT_MS = originalTimeout;
    if (originalCryptoSymbols === undefined) delete process.env.FASTFOREX_SYMBOLS_CRYPTO;
    else process.env.FASTFOREX_SYMBOLS_CRYPTO = originalCryptoSymbols;
  }
});

test('getBackstageCandles rejects whole FastForex operation when a later page fails', async () => {
  const allResults = Array.from({ length: 150 }, (_, index) => makeResult(index));
  const originalFetch = globalThis.fetch;
  let requestCount = 0;

  globalThis.fetch = async (input: string | URL | Request) => {
    requestCount++;
    if (requestCount === 2) {
      return new Response(JSON.stringify({ error: 'temporary provider failure' }), { status: 503 });
    }
    const page = pageForUrl(input, allResults);
    return new Response(JSON.stringify({ results: page }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  };

  try {
    const { getBackstageCandles } = await import('../server/dataSources/fastForex/fastForexCandles');
    await assert.rejects(getBackstageCandles('EUR/USD', 'M1', 150), (error: Error) => {
      assert.equal(error.message, 'BACKSTAGE_CANDLES_PAGE_FAILED');
      return true;
    });
    assert.equal(requestCount, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('getBackstageCandles allows natural FastForex history end after accumulated data', async () => {
  const allResults = Array.from({ length: 100 }, (_, index) => makeResult(index));
  const originalFetch = globalThis.fetch;
  let requestCount = 0;

  globalThis.fetch = async (input: string | URL | Request) => {
    requestCount++;
    const page = requestCount === 1 ? pageForUrl(input, allResults) : [];
    return new Response(JSON.stringify({ results: page }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  };

  try {
    const { getBackstageCandles } = await import('../server/dataSources/fastForex/fastForexCandles');
    const { candles, metrics } = await getBackstageCandles('EUR/USD', 'M1', 150);
    assert.equal(candles.length, 100);
    assert.equal(metrics.uniqueCandlesReceived, 100);
    assert.equal(requestCount, 3, 'two empty pages confirm natural end without provider failure');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
