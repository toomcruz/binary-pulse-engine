import { DataSourceType } from "../dataSourceTypes";

export interface MassiveConfig {
  provider: string;
  apiKey: string;
  baseUrl: string;
  symbolsForex: string[];
  symbolsCrypto: string[];
  isConfigured: boolean;
}

export interface MassiveTick {
  symbol: string;
  price: number;
  bid?: number;
  ask?: number;
  timestamp: number;
  source: DataSourceType;
}
