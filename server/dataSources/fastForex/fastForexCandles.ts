import { MarketCandle } from "../dataSourceTypes";
import { FASTFOREX_API_KEY, FASTFOREX_BASE_URL, isFastForexConfigured, normalizeSymbolToFastForex, isCryptoSymbol } from "./fastForexClient";
import { mapFastForexTimeSeriesToCandles } from "./fastForexMapper";

export interface M5AggregationMetrics {
  m1Received: number;
  m1Valid: number;
  m5Generated: number;
  incompleteBucketsDiscarded: number;
  gappedBucketsDiscarded: number;
}

export function aggregateM1ToM5Strict(m1Candles: MarketCandle[]): { candles: MarketCandle[], metrics: M5AggregationMetrics } {
  const metrics: M5AggregationMetrics = {
    m1Received: m1Candles?.length || 0,
    m1Valid: 0,
    m5Generated: 0,
    incompleteBucketsDiscarded: 0,
    gappedBucketsDiscarded: 0
  };

  if (!m1Candles || m1Candles.length === 0) return { candles: [], metrics };
  
  // Filter only complete
  const validM1 = m1Candles.filter(c => c.complete);
  metrics.m1Valid = validM1.length;

  const bucketMs = 5 * 60 * 1000;
  const groups: Record<number, MarketCandle[]> = {};
  
  for (const candle of validM1) {
    const bucketTimestamp = Math.floor(candle.timestamp / bucketMs) * bucketMs;
    if (!groups[bucketTimestamp]) {
      groups[bucketTimestamp] = [];
    }
    // ensure no duplicates in the same bucket
    if (!groups[bucketTimestamp].some(c => c.timestamp === candle.timestamp)) {
       groups[bucketTimestamp].push(candle);
    }
  }
  
  const m5Candles: MarketCandle[] = [];
  const now = Date.now();
  
  for (const [tsStr, group] of Object.entries(groups)) {
    const timestamp = parseInt(tsStr, 10);
    group.sort((a, b) => a.timestamp - b.timestamp);
    
    // Check exactly 5 candles
    if (group.length !== 5) {
       metrics.incompleteBucketsDiscarded++;
       continue;
    }
    
    // Check no gaps
    let hasGap = false;
    for (let i = 1; i < group.length; i++) {
       if (group[i].timestamp - group[i-1].timestamp !== 60 * 1000) {
           hasGap = true;
           break;
       }
    }
    if (hasGap) {
       metrics.gappedBucketsDiscarded++;
       continue;
    }

    // Bucket must be closed (now > bucket end time)
    if (now < timestamp + bucketMs) {
       metrics.incompleteBucketsDiscarded++;
       continue;
    }
    
    const first = group[0];
    const last = group[group.length - 1];
    
    const highs = group.map(c => c.high);
    const lows = group.map(c => c.low);
    
    m5Candles.push({
      time: new Date(timestamp).toISOString(),
      timestamp,
      open: first.open,
      high: Math.max(...highs),
      low: Math.min(...lows),
      close: last.close,
      volume: group.reduce((sum, c) => sum + (c.volume || 0), 0),
      complete: true,
      source: first.source,
      provider: first.provider,
      instrument: first.instrument,
      granularity: "M5",
      priceType: "mid"
    });
    metrics.m5Generated++;
  }
  
  return { candles: m5Candles.sort((a, b) => a.timestamp - b.timestamp), metrics };
}




async function fetchBinanceM1Batch(symbol: string, limit: number, endTime?: number): Promise<MarketCandle[]> {
  const binanceSymbol = symbol.replace("/", "").replace("USD", "USDT");
  let url = `https://api.binance.us/api/v3/klines?symbol=${binanceSymbol}&interval=1m&limit=${limit}`;
  if (endTime) url += `&endTime=${endTime}`;
  
  const response = await fetch(url);
  if (!response.ok) throw new Error("BINANCE_API_ERROR");
  
  const data = await response.json();
  const now = Date.now();
  return data.map((k: any) => {
    const timestamp = k[0];
    const isClosed = timestamp + 60000 <= now;
    return {
      timestamp,
      time: new Date(timestamp).toISOString(),
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5]),
      complete: isClosed,
      source: "binance",
      provider: "binance",
      instrument: symbol,
      granularity: "M1",
      priceType: "mid"
    };
  });
}

export async function getFastForexCandles(
  symbol: string,
  timeframe: "M1" | "M5",
  limit: number = 100,
  start?: string | number,
  end?: string | number
): Promise<MarketCandle[] | null> {
  try {
    if (!isFastForexConfigured() && !isCryptoSymbol(symbol)) {
      console.log(`[FastForex] API key not configured.`);
      throw new Error("MARKET_CANDLES_UNAVAILABLE");
    }

    const isCrypto = isCryptoSymbol(symbol);
    if (isCrypto) {
        // Fallback to Binance
        const targetM1Candles = timeframe === "M5" ? Math.max(500, limit * 5) : Math.max(300, limit);
        let allM1Candles: MarketCandle[] = [];
        let currentEndTime = end ? (typeof end === 'string' ? new Date(end).getTime() : end) : undefined;
        
        while (allM1Candles.length < targetM1Candles) {
          const remaining = targetM1Candles - allM1Candles.length;
          const fetchLimit = Math.min(1000, remaining); // Binance limit is 1000
          const batch = await fetchBinanceM1Batch(symbol, fetchLimit, currentEndTime);
          if (batch.length === 0) break;
          allM1Candles = [...batch, ...allM1Candles];
          const unique = new Map<number, MarketCandle>();
          for (const c of allM1Candles) unique.set(c.timestamp, c);
          allM1Candles = Array.from(unique.values()).sort((a, b) => a.timestamp - b.timestamp);
          const oldestCandle = allM1Candles[0];
          currentEndTime = oldestCandle.timestamp - 1;
          if (batch.length < fetchLimit) break;
        }
        if (allM1Candles.length === 0) throw new Error("MARKET_CANDLES_UNAVAILABLE");
        
        if (timeframe === "M5") {
          const { candles: m5Candles } = aggregateM1ToM5Strict(allM1Candles);
          return m5Candles.slice(-limit);
        }
        return allM1Candles.slice(-limit);
    }
    const ffSymbol = normalizeSymbolToFastForex(symbol);
    const pairStr = ffSymbol.replace("-", "/");
    const intervalStr = "PT1M";
    
    // We want at least 300 for M1, and 500 for M5
    const targetM1Candles = timeframe === "M5" ? Math.max(500, limit * 5) : Math.max(300, limit);
    let allM1Candles: MarketCandle[] = [];
    let currentEnd = end;

    // FastForex allows up to 100 candles per request
    while (allM1Candles.length < targetM1Candles) {
      const remaining = targetM1Candles - allM1Candles.length;
      const fetchLimit = Math.min(100, remaining);
      
      let url = `${FASTFOREX_BASE_URL}/fx/ohlc/time-series?pair=${encodeURIComponent(pairStr)}&interval=${intervalStr}&limit=${fetchLimit}&api_key=${FASTFOREX_API_KEY}`;
      if (start) url += `&start=${encodeURIComponent(start.toString())}`;
      if (currentEnd) url += `&end=${encodeURIComponent(currentEnd.toString())}`;

      const response = await fetch(url, { headers: { "Accept": "application/json" } });

      if (!response.ok) {
        const errText = await response.text().catch(() => "");
        console.warn(`[FastForex] Candles API error for ${symbol} (${response.status} ${response.statusText}). Body: ${errText}`);
        throw new Error("MARKET_CANDLES_UNAVAILABLE");
      }

      const data = (await response.json()) as any;
      if (data.results && Array.isArray(data.results)) {
        let batch = mapFastForexTimeSeriesToCandles(symbol, data.results, "M1");
        if (batch.length === 0) break;
        
        allM1Candles = [...batch, ...allM1Candles];
        
        // Remove duplicates just in case
        const unique = new Map<number, MarketCandle>();
        for (const c of allM1Candles) {
          unique.set(c.timestamp, c);
        }
        allM1Candles = Array.from(unique.values()).sort((a, b) => a.timestamp - b.timestamp);

        // Update currentEnd to fetch older candles next time
        // FastForex end expects ISO format without milliseconds (e.g. 2026-07-09T18:00:00Z)
        const oldestCandle = allM1Candles[0];
        const dateStr = new Date(oldestCandle.timestamp - 1).toISOString();
        currentEnd = dateStr.replace(/\.\d{3}Z$/, 'Z');
        
        if (batch.length < fetchLimit) {
           break; // No more older data available
        }
      } else {
        console.warn(`[FastForex] Unexpected candles structure for ${symbol}`, data);
        throw new Error("MARKET_CANDLES_UNAVAILABLE");
      }
    }

    if (allM1Candles.length === 0) {
       throw new Error("MARKET_CANDLES_UNAVAILABLE");
    }

    if (timeframe === "M5") {
      const { candles: m5Candles } = aggregateM1ToM5Strict(allM1Candles);
      return m5Candles.slice(-limit);
    }
    
    return allM1Candles.slice(-limit);

  } catch (error) {
    console.error(`[FastForex] Error fetching candles for ${symbol}:`, error);
    throw new Error("MARKET_CANDLES_UNAVAILABLE");
  }
}



export interface BackstagePaginationMetrics {
  batchesFetched: number;
  requestedCandles: number;
  uniqueCandlesReceived: number;
  duplicateCandlesDiscarded: number;
  oldestTimestamp: number | null;
  newestTimestamp: number | null;
  m5Metrics?: M5AggregationMetrics;
}

export async function getBackstageCandles(
  symbol: string,
  timeframe: "M1" | "M5",
  targetCandles: number = 2000
): Promise<{ candles: MarketCandle[], metrics: BackstagePaginationMetrics }> {
  const isCrypto = isCryptoSymbol(symbol);
  if (!isFastForexConfigured() && !isCrypto) {
    throw new Error("MARKET_CANDLES_UNAVAILABLE");
  }

  const metrics: BackstagePaginationMetrics = {
    batchesFetched: 0,
    requestedCandles: targetCandles,
    uniqueCandlesReceived: 0,
    duplicateCandlesDiscarded: 0,
    oldestTimestamp: null,
    newestTimestamp: null
  };


  if (isCrypto) {
    const targetM1 = timeframe === "M5" ? targetCandles * 5 : targetCandles;
    let allM1: Map<number, MarketCandle> = new Map();
    let currentEndTime: number | undefined = undefined;
    let consecutiveEmptyBatches = 0;
    
    while (allM1.size < targetM1) {
      const fetchLimit = Math.min(1000, targetM1 - allM1.size);
      metrics.batchesFetched++;
      try {
        const batch = await fetchBinanceM1Batch(symbol, fetchLimit, currentEndTime);
        if (batch.length === 0) {
           consecutiveEmptyBatches++;
           if (consecutiveEmptyBatches >= 2) break;
           continue;
        } else {
           consecutiveEmptyBatches = 0;
        }
        let addedInBatch = 0;
        for (const c of batch) {
           if (!allM1.has(c.timestamp)) {
              allM1.set(c.timestamp, c);
              addedInBatch++;
           } else {
              metrics.duplicateCandlesDiscarded++;
           }
        }
        if (addedInBatch === 0) break;
        const sortedTimestamps = Array.from(allM1.keys()).sort((a, b) => a - b);
        const oldestTs = sortedTimestamps[0];
        metrics.oldestTimestamp = oldestTs;
        metrics.newestTimestamp = sortedTimestamps[sortedTimestamps.length - 1];
        currentEndTime = oldestTs - 1;
      } catch(e) {
        break;
      }
    }
    metrics.uniqueCandlesReceived = allM1.size;
    let finalM1 = Array.from(allM1.values()).sort((a, b) => a.timestamp - b.timestamp);
    if (timeframe === "M5") {
       const { candles: m5, metrics: m5m } = aggregateM1ToM5Strict(finalM1);
       metrics.m5Metrics = m5m;
       return { candles: m5, metrics };
    }
    return { candles: finalM1, metrics };
  }
  const ffSymbol = normalizeSymbolToFastForex(symbol);
  const pairStr = ffSymbol.replace("-", "/");
  const intervalStr = "PT1M";
  
  // To get N M5 candles, we need 5*N M1 candles minimum
  const targetM1 = timeframe === "M5" ? targetCandles * 5 : targetCandles;
  
  let allM1: Map<number, MarketCandle> = new Map();
  let currentEnd: string | undefined = undefined;

  let consecutiveEmptyBatches = 0;

  while (allM1.size < targetM1) {
    const fetchLimit = Math.min(100, targetM1 - allM1.size);
    metrics.batchesFetched++;
    
    let url = `${FASTFOREX_BASE_URL}/fx/ohlc/time-series?pair=${encodeURIComponent(pairStr)}&interval=${intervalStr}&limit=${fetchLimit}&api_key=${FASTFOREX_API_KEY}`;
    if (currentEnd) url += `&end=${encodeURIComponent(currentEnd)}`;

    const response = await fetch(url, { headers: { "Accept": "application/json" } });
    if (!response.ok) {
       console.warn(`[FastForex] API Error ${response.status}`);
       break; // Stop fetching on error, return what we have
    }

    const data = (await response.json()) as any;
    if (!data.results || !Array.isArray(data.results)) {
       break;
    }

    const batch = mapFastForexTimeSeriesToCandles(symbol, data.results, "M1");
    if (batch.length === 0) {
       consecutiveEmptyBatches++;
       if (consecutiveEmptyBatches >= 2) break; // Break if no more historical data
       continue;
    } else {
       consecutiveEmptyBatches = 0;
    }

    let addedInBatch = 0;
    for (const c of batch) {
       if (!allM1.has(c.timestamp)) {
          allM1.set(c.timestamp, c);
          addedInBatch++;
       } else {
          metrics.duplicateCandlesDiscarded++;
       }
    }

    if (addedInBatch === 0) {
       break; // we fetched a batch we already have entirely
    }

    const sortedTimestamps = Array.from(allM1.keys()).sort((a, b) => a - b);
    const oldestTs = sortedTimestamps[0];
    metrics.oldestTimestamp = oldestTs;
    metrics.newestTimestamp = sortedTimestamps[sortedTimestamps.length - 1];
    
    // Set currentEnd to just before the oldest timestamp
    const dateStr = new Date(oldestTs - 1).toISOString();
    currentEnd = dateStr.replace(/\.\d{3}Z$/, 'Z');
  }

  metrics.uniqueCandlesReceived = allM1.size;

  let finalM1 = Array.from(allM1.values()).sort((a, b) => a.timestamp - b.timestamp);
  
  if (timeframe === "M5") {
     const { candles: m5, metrics: m5m } = aggregateM1ToM5Strict(finalM1);
     metrics.m5Metrics = m5m;
     return { candles: m5, metrics };
  }

  return { candles: finalM1, metrics };
}

