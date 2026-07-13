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

test('FastForex pagination keeps fetching unique M1 batches and builds approximately 100 complete M5 candles from 500 M1', async () => {
  const allResults = Array.from({ length: 500 }, (_, index) => makeResult(index));
  const requestedUrls: string[] = [];
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (input: string | URL | Request) => {
    const url = new URL(input.toString());
    requestedUrls.push(url.toString());

    const limit = Number(url.searchParams.get('limit') || '100');
    const end = url.searchParams.get('end');
    const endTimestamp = end ? new Date(end).getTime() : Number.POSITIVE_INFINITY;
    const eligible = allResults.filter(result => new Date(result.d).getTime() <= endTimestamp);
    const page = eligible.slice(Math.max(0, eligible.length - limit));

    return new Response(JSON.stringify({ results: page }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  };

  try {
    const { getFastForexCandles } = await import('../server/dataSources/fastForex/fastForexCandles');
    const candles = await getFastForexCandles('EUR/USD', 'M5', 100);

    assert.ok(candles, 'FastForex should return candles');
    assert.equal(requestedUrls.length, 5, '500 M1 candles should be fetched across five FastForex pages of 100 candles each');
    assert.equal(candles.length, 100, '500 contiguous M1 candles should form 100 complete M5 candles');
    assert.equal(new Set(candles.map(candle => candle.timestamp)).size, candles.length, 'M5 candles should be unique by timestamp');
    assert.ok(requestedUrls.slice(1).every(url => new URL(url).searchParams.has('end')), 'subsequent pages should request older candles using end');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
