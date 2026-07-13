export interface OandaCandlestick {
  time: string;
  bid?: { o: string; h: string; l: string; c: string };
  ask?: { o: string; h: string; l: string; c: string };
  mid?: { o: string; h: string; l: string; c: string };
  volume: number;
  complete: boolean;
}

export interface OandaCandlesResponse {
  instrument: string;
  granularity: string;
  candles: OandaCandlestick[];
}
