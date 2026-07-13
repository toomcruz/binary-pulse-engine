import { Candle } from '../types';
import { populateIndicators } from '../indicators';

export interface AggregationMetrics {
  received: number;
  valid: number;
  generated: number;
  incompleteBucketsDiscarded: number;
  gappedBucketsDiscarded: number;
}

export function aggregateStrict(
  candles: Candle[],
  fromMinutes: number,
  toMinutes: number,
  analysisTime: number = Date.now()
): { candles: Candle[], metrics: AggregationMetrics } {
  const metrics: AggregationMetrics = {
    received: candles?.length || 0,
    valid: 0,
    generated: 0,
    incompleteBucketsDiscarded: 0,
    gappedBucketsDiscarded: 0
  };

  if (!candles || candles.length === 0) return { candles: [], metrics };
  const ratio = toMinutes / fromMinutes;
  if (ratio % 1 !== 0 || ratio < 1) return { candles: [], metrics };

  // Filter only complete
  const validCandles = candles.filter(c => c.complete === true);
  metrics.valid = validCandles.length;

  const bucketMs = toMinutes * 60 * 1000;
  const groups: Record<number, Candle[]> = {};

  for (const candle of validCandles) {
    if (candle.timestamp === undefined) continue;
    const bucketTimestamp = Math.floor(candle.timestamp / bucketMs) * bucketMs;
    if (!groups[bucketTimestamp]) {
      groups[bucketTimestamp] = [];
    }
    // ensure no duplicates in the same bucket
    if (!groups[bucketTimestamp].some(c => c.timestamp === candle.timestamp)) {
       groups[bucketTimestamp].push(candle);
    }
  }

  const htfCandles: Candle[] = [];
  const now = Date.now();

  for (const [tsStr, group] of Object.entries(groups)) {
    const timestamp = parseInt(tsStr, 10);
    group.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

    // Check exactly required candles
    if (group.length !== ratio) {
       metrics.incompleteBucketsDiscarded++;
       continue;
    }

    // Check no gaps
    let hasGap = false;
    for (let i = 1; i < group.length; i++) {
       if ((group[i].timestamp || 0) - (group[i-1].timestamp || 0) !== fromMinutes * 60 * 1000) {
           hasGap = true;
           break;
       }
    }
    if (hasGap) {
       metrics.gappedBucketsDiscarded++;
       continue;
    }

    // Bucket must be closed (now >= bucket end time)
    // Bucket must be closed relative to analysisTime
    const bucketEnd = timestamp + toMinutes * 60 * 1000;
    if (bucketEnd > analysisTime) {
       metrics.incompleteBucketsDiscarded++;
       continue;
    }

    const first = group[0];
    const last = group[group.length - 1];

    const highs = group.map(c => c.high);
    const lows = group.map(c => c.low);

    htfCandles.push({
      time: new Date(timestamp).toISOString(),
      timestamp,
      open: first.open,
      high: Math.max(...highs),
      low: Math.min(...lows),
      close: last.close,
      volume: group.reduce((sum, c) => sum + (c.volume || 0), 0),
      complete: true,
      provider: first.provider,
      source: first.source
    });
    metrics.generated++;
  }

  // Preencher indicadores somente após concluir a agregação.
  let sortedCandles = htfCandles.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
  if (sortedCandles.length > 0) {
      try {
          sortedCandles = populateIndicators(sortedCandles);
      } catch(e) {}
  }

  return { candles: sortedCandles, metrics };
}

export function calculateEntryTime(
  timeframe: string,
  now: Date = new Date()
): string {
  const durationMinutes =
    timeframe === "M5" ? 5 : 1;

  const entry = new Date(now);

  entry.setSeconds(0, 0);

  if (durationMinutes === 1) {
    entry.setMinutes(entry.getMinutes() + 1);
  } else {
    const currentMinute = entry.getMinutes();
    const nextBlock =
      Math.floor(currentMinute / 5) * 5 + 5;

    entry.setMinutes(nextBlock);
  }

  return entry.toISOString();
}
