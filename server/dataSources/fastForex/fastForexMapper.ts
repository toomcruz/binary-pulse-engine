import { MarketTick, MarketCandle, DataSourceType } from "../dataSourceTypes";

function parseTimestamp(val: any): number {
  const raw = val.dtm || val.d || val.t || val.date;
  if (!raw) return NaN;
  if (typeof raw === 'number') {
    return raw < 10000000000 ? raw * 1000 : raw;
  }
  const num = Number(raw);
  if (!isNaN(num)) {
    return num < 10000000000 ? num * 1000 : num;
  }
  const dateObj = new Date(raw);
  const ts = dateObj.getTime();
  return isNaN(ts) ? NaN : ts;
}

export function mapFastForexQuoteToTick(symbol: string, response: any): MarketTick & { spread?: number } {
  const rawTsp = response.tsp || response.timestamp || response.updated;
  let timestamp = Date.now();
  if (rawTsp) {
    if (typeof rawTsp === 'number') {
      timestamp = rawTsp < 10000000000 ? rawTsp * 1000 : rawTsp;
    } else {
      const tsNum = Number(rawTsp);
      if (!isNaN(tsNum)) {
        timestamp = tsNum < 10000000000 ? tsNum * 1000 : tsNum;
      } else {
        const dObj = new Date(rawTsp);
        if (!isNaN(dObj.getTime())) {
          timestamp = dObj.getTime();
        }
      }
    }
  }

  const bid = response.bid !== undefined ? Number(response.bid) : undefined;
  const ask = response.ask !== undefined ? Number(response.ask) : undefined;
  const spread = response.spread !== undefined ? Number(response.spread) : (bid !== undefined && ask !== undefined ? ask - bid : undefined);
  
  let mid = response.price !== undefined ? Number(response.price) : 0;
  if (bid !== undefined && ask !== undefined) {
    mid = (bid + ask) / 2;
  } else if (bid !== undefined) {
    mid = bid;
  }

  return {
    instrument: symbol.replace("-", "/").toUpperCase(),
    bid: bid,
    ask: ask,
    mid: mid,
    time: new Date(timestamp).toISOString(),
    timestamp,
    source: "fastforex_rest" as DataSourceType,
    provider: "fastforex" as const,
    receivedAt: Date.now(),
    spread: spread
  };
}

export function mapFastForexTimeSeriesToCandles(symbol: string, results: any[], granularity: "M1" | "M5"): MarketCandle[] {
  const instrument = symbol.replace("-", "/").toUpperCase();
  const mappedGranularity = (granularity === "M1" ? "M1" : "M5") as "M1" | "M5";

  const candles: MarketCandle[] = results.map((val: any) => {
    const timestamp = parseTimestamp(val);
    const open = Number(val.o);
    const high = Number(val.h);
    const low = Number(val.l);
    const close = Number(val.c);
    const volume = val.v ? Number(val.v) : undefined;

    if (isNaN(timestamp) || !Number.isFinite(open) || !Number.isFinite(high) || !Number.isFinite(low) || !Number.isFinite(close)) {
      return null;
    }

    const duration = granularity === "M1" ? 60000 : 300000;
    const isClosed = timestamp + duration <= Date.now();

    return {
      time: new Date(timestamp).toISOString(),
      timestamp,
      open,
      high,
      low,
      close,
      volume: Number.isFinite(volume) ? volume : undefined,
      complete: isClosed,
      source: "fastforex_rest" as DataSourceType,
      provider: "fastforex" as const,
      instrument,
      granularity: mappedGranularity,
      priceType: "mid" as const
    } as MarketCandle;
  }).filter((c): c is MarketCandle => c !== null);

  return candles.sort((a, b) => a.timestamp - b.timestamp);
}

