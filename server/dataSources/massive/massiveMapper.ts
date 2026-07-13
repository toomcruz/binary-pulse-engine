import { MarketTick, MarketCandle, DataSourceType } from "../dataSourceTypes";
import { normalizeSymbolFromPolygon } from "./massiveClient";

export function mapForexQuoteToTick(symbol: string, response: any): MarketTick {
  if (!response || !response.last) {
    throw new Error(`Invalid forex response: ${JSON.stringify(response)}`);
  }
  const last = response.last;
  const instrument = symbol.replace("/", "_").toUpperCase();
  const bid = parseFloat(last.bid);
  const ask = parseFloat(last.ask);
  const mid = (bid + ask) / 2;
  const timestamp = last.timestamp || Date.now();

  return {
    instrument,
    bid,
    ask,
    mid,
    time: new Date(timestamp).toISOString(),
    timestamp,
    source: "massive_rest" as DataSourceType,
    provider: "massive" as const,
    receivedAt: Date.now()
  };
}

export function mapCryptoTradeToTick(symbol: string, response: any): MarketTick {
  if (!response || !response.last) {
    throw new Error(`Invalid crypto response: ${JSON.stringify(response)}`);
  }
  const last = response.last;
  const instrument = symbol.replace("/", "_").toUpperCase();
  const price = parseFloat(last.price);
  const timestamp = last.timestamp || Date.now();

  // Create a realistic tight spread for Crypto (0.01% of price)
  const spread = price * 0.0001;
  const bid = price - spread / 2;
  const ask = price + spread / 2;

  return {
    instrument,
    bid,
    ask,
    mid: price,
    time: new Date(timestamp).toISOString(),
    timestamp,
    source: "massive_rest" as DataSourceType,
    provider: "massive" as const,
    receivedAt: Date.now()
  };
}

export function mapPolygonAggsToCandles(symbol: string, results: any[], granularity: "M1" | "M5"): MarketCandle[] {
  const instrument = symbol.replace("/", "_").toUpperCase();
  const mappedGranularity = (granularity === "M1" ? "M1" : "M5") as "M1" | "M5";

  return results.map((val: any) => {
    const timestamp = val.t; // Polygon timestamp is milliseconds
    return {
      time: new Date(timestamp).toISOString(),
      timestamp,
      open: parseFloat(val.o),
      high: parseFloat(val.h),
      low: parseFloat(val.l),
      close: parseFloat(val.c),
      volume: val.v ? parseFloat(val.v) : undefined,
      complete: true,
      source: "massive_rest" as DataSourceType,
      provider: "massive" as const,
      instrument,
      granularity: mappedGranularity,
      priceType: "mid" as const
    };
  }).filter((c: any) => !isNaN(c.open) && !isNaN(c.close));
}
