import { oandaFetch, getOandaConfig } from "./oandaClient";
import { MarketCandle } from "../dataSourceTypes";

export async function fetchOandaCandles(params: {
  instrument: string;
  granularity: "M1" | "M5";
  count?: number;
  price?: "M" | "BA";
  from?: string;
  to?: string;
}): Promise<MarketCandle[]> {
  const oandaConfig = getOandaConfig();
  if (!oandaConfig.isConfigured) {
    throw new Error("MARKET_CANDLES_UNAVAILABLE");
  }

  const count = params.count || 200;
  const granularity = params.granularity;
  const price = params.price || "M";

  const queryParams = new URLSearchParams();
  queryParams.append("granularity", granularity);
  queryParams.append("count", count.toString());
  queryParams.append("price", price);
  if (params.from) queryParams.append("from", params.from);
  if (params.to) queryParams.append("to", params.to);

  const res = await oandaFetch(`v3/instruments/${params.instrument}/candles?${queryParams.toString()}`);
  if (!res.ok || !res.data || !Array.isArray(res.data.candles)) {
    throw new Error("MARKET_CANDLES_UNAVAILABLE");
  }

  return res.data.candles.map((candle: any) => {
    const mid = candle.mid || candle.bid || candle.ask;
    const openPrice = parseFloat(mid.o);
    const highPrice = parseFloat(mid.h);
    const lowPrice = parseFloat(mid.l);
    const closePrice = parseFloat(mid.c);
    const timestamp = new Date(candle.time).getTime();

    return {
      time: candle.time,
      timestamp,
      open: openPrice,
      high: highPrice,
      low: lowPrice,
      close: closePrice,
      volume: candle.volume,
      complete: candle.complete,
      source: "oanda_rest",
      provider: "oanda",
      instrument: params.instrument,
      granularity,
      priceType: "mid"
    };
  });
}
