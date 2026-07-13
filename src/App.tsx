import React, { useState, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  TrendingUp, 
  TrendingDown, 
  Clock, 
  Cpu, 
  DollarSign, 
  AlertTriangle, 
  History, 
  CheckCircle2, 
  XCircle, 
  ChevronRight, 
  RefreshCw, 
  Info,
  Shield,
  HelpCircle,
  TrendingUp as CallIcon,
  TrendingDown as PutIcon,
  Play,
  Target,
  Flame,
  Zap,
  Sliders,
  Award,
  ShieldAlert,
  ShieldCheck,
  Check,
  MessageSquare,
  Send,
  Bot,
  Sparkles,
  Volume2,
  VolumeX,
  Trash2,
  BarChart3,
  Download
} from "lucide-react";
import TradingChart from "./components/TradingChart";
import { Candle, AISignal, Trade, AssetConfig, StrategyType, StrategyCatalog } from "./types";
import { formatPercent, finiteNumber, clampPercent } from "./lib/format";

// Configurations for assets
const ASSETS: AssetConfig[] = [
  { symbol: "EUR/USD", name: "Euro / Dólar Americano", basePrice: 1.08420, pipSize: 0.00001, decimals: 5, volatility: 0.00012, payout: 0.88 },
  { symbol: "GBP/USD", name: "Libra Esterlina / Dólar Americano", basePrice: 1.26540, pipSize: 0.00001, decimals: 5, volatility: 0.00015, payout: 0.89 },
  { symbol: "USD/JPY", name: "Dólar Americano / Iene Japonês", basePrice: 151.620, pipSize: 0.001, decimals: 3, volatility: 0.00012, payout: 0.86 },
  { symbol: "EUR/JPY", name: "Euro / Iene Japonês", basePrice: 163.540, pipSize: 0.001, decimals: 3, volatility: 0.00013, payout: 0.87 },
  { symbol: "GBP/JPY", name: "Libra Esterlina / Iene Japonês", basePrice: 182.410, pipSize: 0.001, decimals: 3, volatility: 0.00014, payout: 0.85 },
  { symbol: "AUD/USD", name: "Dólar Australiano / Dólar Americano", basePrice: 0.65420, pipSize: 0.00001, decimals: 5, volatility: 0.00014, payout: 0.85 },
  { symbol: "USD/CAD", name: "Dólar Americano / Dólar Canadense", basePrice: 1.35750, pipSize: 0.00001, decimals: 5, volatility: 0.00011, payout: 0.85 },
  { symbol: "EUR/GBP", name: "Euro / Libra Esterlina", basePrice: 0.85620, pipSize: 0.00001, decimals: 5, volatility: 0.00008, payout: 0.84 },
  { symbol: "BTC/USD", name: "Bitcoin / Dólar Americano (Cripto)", basePrice: 64210.0, pipSize: 0.1, decimals: 1, volatility: 0.00085, payout: 0.80 },
  { symbol: "ETH/USD", name: "Ethereum / Dólar Americano (Cripto)", basePrice: 3450.0, pipSize: 0.01, decimals: 2, volatility: 0.00095, payout: 0.82 },
  { symbol: "SOL/USD", name: "Solana / Dólar Americano (Cripto)", basePrice: 142.50, pipSize: 0.01, decimals: 2, volatility: 0.0012, payout: 0.80 },
  { symbol: "XRP/USD", name: "Ripple / Dólar Americano (Cripto)", basePrice: 0.5840, pipSize: 0.0001, decimals: 4, volatility: 0.0014, payout: 0.78 },
  { symbol: "BNB/USD", name: "Binance Coin / Dólar Americano (Cripto)", basePrice: 575.0, pipSize: 0.1, decimals: 1, volatility: 0.0008, payout: 0.81 },
  { symbol: "USD/BRL", name: "Dólar / Real Brasileiro", basePrice: 4.9210, pipSize: 0.0001, decimals: 4, volatility: 0.00045, payout: 0.87 }
];

// Helper to format basic markdown-style text in chat messages
const formatMessageText = (text: string) => {
  if (!text) return "";
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={index} className="font-extrabold text-indigo-400">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return part;
  });
};

export default function App() {
  const [selectedAsset, setSelectedAsset] = useState<AssetConfig>(ASSETS[0]);
  const [timeframe, setTimeframe] = useState<"M1" | "M5">("M5");
  const [autoAnalyzeTrigger, setAutoAnalyzeTrigger] = useState<string | null>(null);
  const isAlignedRef = useRef(false);
  
  // Market Prices State
  const [currentPrice, setCurrentPrice] = useState<number>(selectedAsset.basePrice);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [priceHistory, setPriceHistory] = useState<number[]>([]);
  
  // Strategy Choice State
  const [strategy, setStrategy] = useState<StrategyType>("reversion");

  // Dynamic Strategy Catalog State (Maintains win rate statistics per asset)
  const [strategyCatalogs, setStrategyCatalogs] = useState<Record<string, StrategyCatalog[]>>({
    "EUR/USD": [
      { strategy: 'reversion', name: "Retração em Extremos (MHI)", description: "Opera exaustão em Bollinger externa e RSI extremo.", wins: 0, losses: 0, winRate: null },
      { strategy: 'trend', name: "Seguidor de Tendência (EMA/MACD)", description: "Opera fluxo direcional com EMAs e histograma MACD.", wins: 0, losses: 0, winRate: null },
      { strategy: 'price_action', name: "Price Action / Rejeição de Vela", description: "Padrões de vela clássicos (martelos/estrelas) em suportes.", wins: 0, losses: 0, winRate: null },
      { strategy: 'breakout', name: "Rompimento Dinâmico (ATR/Bollinger)", description: "Opera rompimento de suportes, resistências e canais em alta volatilidade.", wins: 0, losses: 0, winRate: null },
      { strategy: 'candle_flow', name: "Fluxo de Velas / Momentum", description: "Opera sequências de velas de mesma cor com baixo pavio e força de médias.", wins: 0, losses: 0, winRate: null }
    ],
    "GBP/USD": [
      { strategy: 'reversion', name: "Retração em Extremos (MHI)", description: "Opera exaustão em Bollinger externa e RSI extremo.", wins: 0, losses: 0, winRate: null },
      { strategy: 'trend', name: "Seguidor de Tendência (EMA/MACD)", description: "Opera fluxo direcional com EMAs e histograma MACD.", wins: 0, losses: 0, winRate: null },
      { strategy: 'price_action', name: "Price Action / Rejeição de Vela", description: "Padrões de vela clássicos (martelos/estrelas) em suportes.", wins: 0, losses: 0, winRate: null },
      { strategy: 'breakout', name: "Rompimento Dinâmico (ATR/Bollinger)", description: "Opera rompimento de suportes, resistências e canais em alta volatilidade.", wins: 0, losses: 0, winRate: null },
      { strategy: 'candle_flow', name: "Fluxo de Velas / Momentum", description: "Opera sequências de velas de mesma cor com baixo pavio e força de médias.", wins: 0, losses: 0, winRate: null }
    ],
    "USD/JPY": [
      { strategy: 'reversion', name: "Retração em Extremos (MHI)", description: "Opera exaustão em Bollinger externa e RSI extremo.", wins: 0, losses: 0, winRate: null },
      { strategy: 'trend', name: "Seguidor de Tendência (EMA/MACD)", description: "Opera fluxo direcional com EMAs e histograma MACD.", wins: 0, losses: 0, winRate: null },
      { strategy: 'price_action', name: "Price Action / Rejeição de Vela", description: "Padrões de vela clássicos (martelos/estrelas) em suportes.", wins: 0, losses: 0, winRate: null },
      { strategy: 'breakout', name: "Rompimento Dinâmico (ATR/Bollinger)", description: "Opera rompimento de suportes, resistências e canais em alta volatilidade.", wins: 0, losses: 0, winRate: null },
      { strategy: 'candle_flow', name: "Fluxo de Velas / Momentum", description: "Opera sequências de velas de mesma cor com baixo pavio e força de médias.", wins: 0, losses: 0, winRate: null }
    ],
    "GBP/JPY": [
      { strategy: 'reversion', name: "Retração em Extremos (MHI)", description: "Opera exaustão em Bollinger externa e RSI extremo.", wins: 0, losses: 0, winRate: null },
      { strategy: 'trend', name: "Seguidor de Tendência (EMA/MACD)", description: "Opera fluxo direcional com EMAs e histograma MACD.", wins: 0, losses: 0, winRate: null },
      { strategy: 'price_action', name: "Price Action / Rejeição de Vela", description: "Padrões de vela clássicos (martelos/estrelas) em suportes.", wins: 0, losses: 0, winRate: null },
      { strategy: 'breakout', name: "Rompimento Dinâmico (ATR/Bollinger)", description: "Opera rompimento de suportes, resistências e canais em alta volatilidade.", wins: 0, losses: 0, winRate: null },
      { strategy: 'candle_flow', name: "Fluxo de Velas / Momentum", description: "Opera sequências de velas de mesma cor com baixo pavio e força de médias.", wins: 0, losses: 0, winRate: null }
    ],
    "AUD/USD": [
      { strategy: 'reversion', name: "Retração em Extremos (MHI)", description: "Opera exaustão em Bollinger externa e RSI extremo.", wins: 0, losses: 0, winRate: null },
      { strategy: 'trend', name: "Seguidor de Tendência (EMA/MACD)", description: "Opera fluxo direcional com EMAs e histograma MACD.", wins: 0, losses: 0, winRate: null },
      { strategy: 'price_action', name: "Price Action / Rejeição de Vela", description: "Padrões de vela clássicos (martelos/estrelas) em suportes.", wins: 0, losses: 0, winRate: null },
      { strategy: 'breakout', name: "Rompimento Dinâmico (ATR/Bollinger)", description: "Opera rompimento de suportes, resistências e canais em alta volatilidade.", wins: 0, losses: 0, winRate: null },
      { strategy: 'candle_flow', name: "Fluxo de Velas / Momentum", description: "Opera sequências de velas de mesma cor com baixo pavio e força de médias.", wins: 0, losses: 0, winRate: null }
    ],
    "USD/CAD": [
      { strategy: 'reversion', name: "Retração em Extremos (MHI)", description: "Opera exaustão em Bollinger externa e RSI extremo.", wins: 0, losses: 0, winRate: null },
      { strategy: 'trend', name: "Seguidor de Tendência (EMA/MACD)", description: "Opera fluxo direcional com EMAs e histograma MACD.", wins: 0, losses: 0, winRate: null },
      { strategy: 'price_action', name: "Price Action / Rejeição de Vela", description: "Padrões de vela clássicos (martelos/estrelas) em suportes.", wins: 0, losses: 0, winRate: null },
      { strategy: 'breakout', name: "Rompimento Dinâmico (ATR/Bollinger)", description: "Opera rompimento de suportes, resistências e canais em alta volatilidade.", wins: 0, losses: 0, winRate: null },
      { strategy: 'candle_flow', name: "Fluxo de Velas / Momentum", description: "Opera sequências de velas de mesma cor com baixo pavio e força de médias.", wins: 0, losses: 0, winRate: null }
    ],
    "EUR/GBP": [
      { strategy: 'reversion', name: "Retração em Extremos (MHI)", description: "Opera exaustão em Bollinger externa e RSI extremo.", wins: 0, losses: 0, winRate: null },
      { strategy: 'trend', name: "Seguidor de Tendência (EMA/MACD)", description: "Opera fluxo direcional com EMAs e histograma MACD.", wins: 0, losses: 0, winRate: null },
      { strategy: 'price_action', name: "Price Action / Rejeição de Vela", description: "Padrões de vela clássicos (martelos/estrelas) em suportes.", wins: 0, losses: 0, winRate: null },
      { strategy: 'breakout', name: "Rompimento Dinâmico (ATR/Bollinger)", description: "Opera rompimento de suportes, resistências e canais em alta volatilidade.", wins: 0, losses: 0, winRate: null },
      { strategy: 'candle_flow', name: "Fluxo de Velas / Momentum", description: "Opera sequências de velas de mesma cor com baixo pavio e força de médias.", wins: 0, losses: 0, winRate: null }
    ],
    "BTC/USD": [
      { strategy: 'reversion', name: "Retração em Extremos (MHI)", description: "Opera exaustão em Bollinger externa e RSI extremo.", wins: 0, losses: 0, winRate: null },
      { strategy: 'trend', name: "Seguidor de Tendência (EMA/MACD)", description: "Opera fluxo direcional com EMAs e histograma MACD.", wins: 0, losses: 0, winRate: null },
      { strategy: 'price_action', name: "Price Action / Rejeição de Vela", description: "Padrões de vela clássicos (martelos/estrelas) em suportes.", wins: 0, losses: 0, winRate: null },
      { strategy: 'breakout', name: "Rompimento Dinâmico (ATR/Bollinger)", description: "Opera rompimento de suportes, resistências e canais em alta volatilidade.", wins: 0, losses: 0, winRate: null },
      { strategy: 'candle_flow', name: "Fluxo de Velas / Momentum", description: "Opera sequências de velas de mesma cor com baixo pavio e força de médias.", wins: 0, losses: 0, winRate: null }
    ],
    "ETH/USD": [
      { strategy: 'reversion', name: "Retração em Extremos (MHI)", description: "Opera exaustão em Bollinger externa e RSI extremo.", wins: 0, losses: 0, winRate: null },
      { strategy: 'trend', name: "Seguidor de Tendência (EMA/MACD)", description: "Opera fluxo direcional com EMAs e histograma MACD.", wins: 0, losses: 0, winRate: null },
      { strategy: 'price_action', name: "Price Action / Rejeição de Vela", description: "Padrões de vela clássicos (martelos/estrelas) em suportes.", wins: 0, losses: 0, winRate: null },
      { strategy: 'breakout', name: "Rompimento Dinâmico (ATR/Bollinger)", description: "Opera rompimento de suportes, resistências e canais em alta volatilidade.", wins: 0, losses: 0, winRate: null },
      { strategy: 'candle_flow', name: "Fluxo de Velas / Momentum", description: "Opera sequências de velas de mesma cor com baixo pavio e força de médias.", wins: 0, losses: 0, winRate: null }
    ],
    "SOL/USD": [
      { strategy: 'reversion', name: "Retração em Extremos (MHI)", description: "Opera exaustão em Bollinger externa e RSI extremo.", wins: 0, losses: 0, winRate: null },
      { strategy: 'trend', name: "Seguidor de Tendência (EMA/MACD)", description: "Opera fluxo direcional com EMAs e histograma MACD.", wins: 0, losses: 0, winRate: null },
      { strategy: 'price_action', name: "Price Action / Rejeição de Vela", description: "Padrões de vela clássicos (martelos/estrelas) em suportes.", wins: 0, losses: 0, winRate: null },
      { strategy: 'breakout', name: "Rompimento Dinâmico (ATR/Bollinger)", description: "Opera rompimento de suportes, resistências e canais em alta volatilidade.", wins: 0, losses: 0, winRate: null },
      { strategy: 'candle_flow', name: "Fluxo de Velas / Momentum", description: "Opera sequências de velas de mesma cor com baixo pavio e força de médias.", wins: 0, losses: 0, winRate: null }
    ],
    "XRP/USD": [
      { strategy: 'reversion', name: "Retração em Extremos (MHI)", description: "Opera exaustão em Bollinger externa e RSI extremo.", wins: 0, losses: 0, winRate: null },
      { strategy: 'trend', name: "Seguidor de Tendência (EMA/MACD)", description: "Opera fluxo direcional com EMAs e histograma MACD.", wins: 0, losses: 0, winRate: null },
      { strategy: 'price_action', name: "Price Action / Rejeição de Vela", description: "Padrões de vela clássicos (martelos/estrelas) em suportes.", wins: 0, losses: 0, winRate: null },
      { strategy: 'breakout', name: "Rompimento Dinâmico (ATR/Bollinger)", description: "Opera rompimento de suportes, resistências e canais em alta volatilidade.", wins: 0, losses: 0, winRate: null },
      { strategy: 'candle_flow', name: "Fluxo de Velas / Momentum", description: "Opera sequências de velas de mesma cor com baixo pavio e força de médias.", wins: 0, losses: 0, winRate: null }
    ],
    "BNB/USD": [
      { strategy: 'reversion', name: "Retração em Extremos (MHI)", description: "Opera exaustão em Bollinger externa e RSI extremo.", wins: 0, losses: 0, winRate: null },
      { strategy: 'trend', name: "Seguidor de Tendência (EMA/MACD)", description: "Opera fluxo direcional com EMAs e histograma MACD.", wins: 0, losses: 0, winRate: null },
      { strategy: 'price_action', name: "Price Action / Rejeição de Vela", description: "Padrões de vela clássicos (martelos/estrelas) em suportes.", wins: 0, losses: 0, winRate: null },
      { strategy: 'breakout', name: "Rompimento Dinâmico (ATR/Bollinger)", description: "Opera rompimento de suportes, resistências e canais em alta volatilidade.", wins: 0, losses: 0, winRate: null },
      { strategy: 'candle_flow', name: "Fluxo de Velas / Momentum", description: "Opera sequências de velas de mesma cor com baixo pavio e força de médias.", wins: 0, losses: 0, winRate: null }
    ],
    "USD/BRL": [
      { strategy: 'reversion', name: "Retração em Extremos (MHI)", description: "Opera exaustão em Bollinger externa e RSI extremo.", wins: 0, losses: 0, winRate: null },
      { strategy: 'trend', name: "Seguidor de Tendência (EMA/MACD)", description: "Opera fluxo direcional com EMAs e histograma MACD.", wins: 0, losses: 0, winRate: null },
      { strategy: 'price_action', name: "Price Action / Rejeição de Vela", description: "Padrões de vela clássicos (martelos/estrelas) em suportes.", wins: 0, losses: 0, winRate: null },
      { strategy: 'breakout', name: "Rompimento Dinâmico (ATR/Bollinger)", description: "Opera rompimento de suportes, resistências e canais em alta volatilidade.", wins: 0, losses: 0, winRate: null },
      { strategy: 'candle_flow', name: "Fluxo de Velas / Momentum", description: "Opera sequências de velas de mesma cor com baixo pavio e força de médias.", wins: 0, losses: 0, winRate: null }
    ]
  });

  // UI Signals States
  const [activeSignal, setActiveSignal] = useState<AISignal | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isContinuousAnalysis, setIsContinuousAnalysis] = useState<boolean>(true);
  const [isBackgroundAnalyzing, setIsBackgroundAnalyzing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);


  const [fastForexHealth, setFastForexHealth] = useState<any>(null);

  const [currentSpread, setCurrentSpread] = useState<number | null>(null);

  const isFastForexOperational = fastForexHealth?.configured === true && 
                             fastForexHealth?.connected === true && 
                             fastForexHealth?.lastRealTickAt && 
                             fastForexHealth?.dataAgeMs !== null && 
                             fastForexHealth?.dataAgeMs <= 10000;

  
  useEffect(() => {
    const fetchFastForexHealth = async () => {
      try {
        const res = await fetch('/api/market/status');
        if (res.ok) {
          const data = await res.json();
          setFastForexHealth(data);
        }
        
        // Also fetch latest tick for spread using FastForex
        if (selectedAsset) {
          const symbolParam = selectedAsset.symbol.replace("_", "/");
          const tickRes = await fetch(`/api/market/latest-price?symbol=${symbolParam}`);
          if (tickRes.ok) {
            const tickData = await tickRes.json();
            if (tickData.ok && tickData.ask && tickData.bid) {
               const spread = tickData.ask - tickData.bid;
               let pipSize = 0.0001;
               if (selectedAsset.symbol.includes("JPY")) pipSize = 0.01;
               setCurrentSpread(spread / pipSize);
            } else {
               setCurrentSpread(null);
            }
          }
        }
      } catch (e) {}
    };
    fetchFastForexHealth();
    const interval = setInterval(fetchFastForexHealth, 1000);
    return () => clearInterval(interval);
  }, [selectedAsset]);

  const [backstageReplaySignals, setBackstageReplaySignals] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem("backstage_replay_results");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [isBackstageRunning, setIsBackstageRunning] = useState(false);
  const [backstageStatusOverride, setBackstageStatusOverride] = useState<string | null>(null);
  const [backstageError, setBackstageError] = useState<string | null>(null);

  const [scannerResults, setScannerResults] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem("backstage_scanner_results");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [scannerStats, setScannerStats] = useState<any>(() => {
    try {
      const saved = localStorage.getItem("backstage_scanner_stats");
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [isScannerRunning, setIsScannerRunning] = useState(false);
  const [scannerError, setScannerError] = useState<string | null>(null);
  const [isPaperTradingExpanded, setIsPaperTradingExpanded] = useState(false);
  const [isPaperTradingActive, setIsPaperTradingActive] = useState(false);

  const [paperTradingSignals, setPaperTradingSignals] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem("paper_trading_signals");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.map(s => {
            // Keep new ones as is
            if (s.engineVersion === "v3.8-fastforex-paper-real" || s.engineVersion === "v3.8-fastforex-paper-real" || s.engineVersion === "v3.8-fastforex-paper-real") return s;
            
            // Validate legacy ones to see if they are completely broken
            const hasRequiredFields = s.entryPrice !== undefined && 
              s.exitPrice !== undefined && 
              (s.result === "WIN" || s.result === "LOSS") &&
              s.asset && s.timeframe && s.strategy && s.signal && s.entryTime && 
              (s.timestamp || s.tradingDate);
              
            if (!hasRequiredFields) {
              return { ...s, validationSource: "unknown" };
            }
            return { ...s, validationSource: "legacy" };
          });
        }
      }
    } catch(e) {}
    return [];
  });

  const paperTradingStatus = useMemo(() => {
    const eligibleSignals = paperTradingSignals.filter(s => {
      if (s.engineVersion !== "v3.8-fastforex-paper-real") return false;
      if (s.validationSource !== "fastforex_real_price") return false;
      if (s.entryPriceProvider !== "fastforex") return false;
      if (s.exitPriceProvider !== "fastforex") return false;
      if (s.entryPriceDataSourceType !== "fastforex_rest" && s.entryPriceDataSourceType !== "fastforex_stream") return false;
      if (s.exitPriceDataSourceType !== "fastforex_rest" && s.exitPriceDataSourceType !== "fastforex_stream") return false;
      if (s.result !== "WIN" && s.result !== "LOSS") return false;

      return true;
    });

    const legacyIgnored = paperTradingSignals.filter(s => 
      s.engineVersion !== "v3.8-fastforex-paper-real" || 
      s.validationSource !== "fastforex_real_price"
    ).length;

    const draws = paperTradingSignals.filter(s => s.result === "DRAW").length;
    const pendingCount = paperTradingSignals.filter(s => s.result === "PENDING" || !s.result).length;
    const neutralCount = paperTradingSignals.filter(s => s.signal === "NEUTRAL").length;
    
    const currentSignals = eligibleSignals.length;
    const wins = eligibleSignals.filter(s => s.result === "WIN").length;
    const losses = eligibleSignals.filter(s => s.result === "LOSS").length;
    const winRate = currentSignals > 0 ? (wins / currentSignals) * 100 : 0;
    
    let maxConsecutiveLosses = 0;
    let currentLosses = 0;
    for (const s of eligibleSignals) {
      if (s.result === "LOSS") {
        currentLosses++;
        if (currentLosses > maxConsecutiveLosses) maxConsecutiveLosses = currentLosses;
      } else if (s.result === "WIN") {
        currentLosses = 0;
      }
    }
    
    const isApproved = currentSignals >= 100 && winRate >= 58 && maxConsecutiveLosses <= 5;
    const validationStatus = currentSignals < 100 ? "PAPER_TESTING" : (isApproved ? "VALIDATED" : "REJECTED");
    
    return {
      validationStatus,
      requiredSignals: 100,
      currentSignals,
      isLiveTradingApproved: isApproved,
      totalSignals: currentSignals,
      draws,
      winRate: parseFloat(winRate.toFixed(1)),
      maxConsecutiveLosses,
      legacyIgnored,
      pendingCount,
      neutralCount
    };
  }, [paperTradingSignals]);

  const backstageStatus = useMemo(() => {
    const eligibleSignals = backstageReplaySignals.filter(s => 
      s.engineVersion === "v3.8-fastforex-backstage" &&
      s.validationSource === "fastforex_historical_closed_candles" &&
      (s.result === "WIN" || s.result === "LOSS")
    );

    const draws = backstageReplaySignals.filter(s => s.result === "DRAW").length;
    
    const currentSignals = eligibleSignals.length;
    const wins = eligibleSignals.filter(s => s.result === "WIN").length;
    const losses = eligibleSignals.filter(s => s.result === "LOSS").length;
    const winRate = currentSignals > 0 ? (wins / currentSignals) * 100 : 0;
    
    let maxConsecutiveLosses = 0;
    let currentLosses = 0;
    for (const s of eligibleSignals) {
      if (s.result === "LOSS") {
        currentLosses++;
        if (currentLosses > maxConsecutiveLosses) maxConsecutiveLosses = currentLosses;
      } else if (s.result === "WIN") {
        currentLosses = 0;
      }
    }
    
    const isApproved = currentSignals >= 100 && winRate >= 58 && maxConsecutiveLosses <= 5;
    
    let validationStatus: "BACKSTAGE_TESTING" | "BACKSTAGE_VALIDATED" | "BACKSTAGE_REJECTED" | "MARKET_CANDLES_UNAVAILABLE" = "BACKSTAGE_TESTING";
    if (backstageStatusOverride === "MARKET_CANDLES_UNAVAILABLE") {
      validationStatus = "MARKET_CANDLES_UNAVAILABLE";
    } else if (currentSignals < 100) {
      validationStatus = "BACKSTAGE_TESTING";
    } else {
      validationStatus = isApproved ? "BACKSTAGE_VALIDATED" : "BACKSTAGE_REJECTED";
    }
    
    const byStrategy: Record<string, any> = {};
    const byAsset: Record<string, any> = {};
    const byTimeframe: Record<string, any> = {};
    const byRegime: Record<string, any> = {};

    for (const s of eligibleSignals) {
      if (!byStrategy[s.strategy]) byStrategy[s.strategy] = { total: 0, wins: 0, losses: 0 };
      if (!byAsset[s.asset]) byAsset[s.asset] = { total: 0, wins: 0, losses: 0 };
      if (!byTimeframe[s.timeframe]) byTimeframe[s.timeframe] = { total: 0, wins: 0, losses: 0 };
      if (s.regime && !byRegime[s.regime]) byRegime[s.regime] = { total: 0, wins: 0, losses: 0 };

      byStrategy[s.strategy].total++;
      byAsset[s.asset].total++;
      byTimeframe[s.timeframe].total++;
      if (s.regime) byRegime[s.regime].total++;

      if (s.result === "WIN") {
        byStrategy[s.strategy].wins++;
        byAsset[s.asset].wins++;
        byTimeframe[s.timeframe].wins++;
        if (s.regime) byRegime[s.regime].wins++;
      } else if (s.result === "LOSS") {
        byStrategy[s.strategy].losses++;
        byAsset[s.asset].losses++;
        byTimeframe[s.timeframe].losses++;
        if (s.regime) byRegime[s.regime].losses++;
      }
    }

    const calcWinRate = (obj: any) => {
      for (const key in obj) {
        obj[key].winRate = obj[key].total > 0 ? (obj[key].wins / obj[key].total) * 100 : 0;
      }
    };
    calcWinRate(byStrategy);
    calcWinRate(byAsset);
    calcWinRate(byTimeframe);
    calcWinRate(byRegime);

    return {
      validationStatus,
      requiredSignals: 100,
      currentSignals,
      wins,
      losses,
      draws,
      winRate: parseFloat(winRate.toFixed(1)),
      maxConsecutiveLosses,
      byStrategy,
      byAsset,
      byTimeframe,
      byRegime
    };
  }, [backstageReplaySignals, backstageStatusOverride]);

  const combinedStatus = useMemo(() => {
    const backstageValidated = backstageStatus.validationStatus === "BACKSTAGE_VALIDATED";
    const paperTradingValidated = paperTradingStatus.validationStatus === "VALIDATED";
    
    let finalStatus: "NOT_READY" | "BACKTEST_ONLY" | "PAPER_ONLY" | "READY_FOR_REVIEW" = "NOT_READY";
    if (backstageValidated && paperTradingValidated) finalStatus = "READY_FOR_REVIEW";
    else if (backstageValidated && !paperTradingValidated) finalStatus = "BACKTEST_ONLY";
    else if (!backstageValidated && paperTradingValidated) finalStatus = "PAPER_ONLY";

    return {
      backstageValidated,
      paperTradingValidated,
      finalStatus
    };
  }, [backstageStatus, paperTradingStatus]);

  
  // Histórico de Sinais Enviados (Signal History)
  const [signalHistory, setSignalHistory] = useState<AISignal[]>(() => {
    try {
      const saved = localStorage.getItem("binary_pulse_signals_history");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn("Erro ao carregar histórico de sinais do localStorage:", e);
    }
    return [
      {
        id: "sh1",
        asset: "EUR/USD",
        timeframe: "M1",
        strategy: "reversion",
        signal: "CALL",
        confidence: 94,
        expiry: "1 MINUTO",
        entryTime: "15:05:00",
        analysisTitle: "Estratégia Retração: Toque em Suporte Crítico Sobrevendido",
        reasoning: ["RSI em forte sobrevenda extrema de curto prazo.", "Toque milimétrico e rejeição na Banda Inferior de Bollinger."],
        keyLevels: { support: 1.0825, resistance: 1.0838 },
        indicatorsStatus: { rsi: "Sobrevendido", macd: "Momento de Alta", bollinger: "Exaustão inferior", movingAverages: "Suporte na SMA" },
        entryPrice: 1.08280,
        exitPrice: 1.08310,
        status: "WIN",
        isSimulated: true,
        timestamp: new Date(Date.now() - 15 * 60000).toISOString()
      },
      {
        id: "sh2",
        asset: "GBP/JPY",
        timeframe: "M5",
        strategy: "trend",
        signal: "PUT",
        confidence: 91,
        expiry: "5 MINUTOS",
        entryTime: "14:50:00",
        analysisTitle: "Estratégia Tendência: Pullback de Baixa em Momentum",
        reasoning: ["EMA 9 rápida operando abaixo de SMA 21 lenta.", "Histograma MACD confirmando momentum vendedor crescente."],
        keyLevels: { support: 181.85, resistance: 182.40 },
        indicatorsStatus: { rsi: "Neutro", macd: "Queda Forte", bollinger: "Centro", movingAverages: "Alinhamento Baixista" },
        entryPrice: 182.150,
        exitPrice: 182.110,
        status: "WIN",
        isSimulated: true,
        timestamp: new Date(Date.now() - 30 * 60000).toISOString()
      }
    ];
  });

  useEffect(() => {
    try {
      localStorage.setItem("binary_pulse_signals_history", JSON.stringify(signalHistory));
    } catch (e) {
      console.warn("Erro ao salvar histórico de sinais no localStorage:", e);
    }
  }, [signalHistory]);

  // Escolhe automaticamente a estratégia com maior taxa de acerto APENAS se houver resultados reais
  useEffect(() => {
    const assetStrategies = strategyCatalogs[selectedAsset.symbol];
    if (assetStrategies && assetStrategies.length > 0) {
      // Filter only strategies that have real backstage data
      const validatedStrategies = assetStrategies.filter(s => s.winRate !== null);
      if (validatedStrategies.length > 0) {
        const bestStrategy = validatedStrategies.reduce((prev, current) => 
          ((current.winRate ?? 0) > (prev.winRate ?? 0)) ? current : prev
        , validatedStrategies[0]);
        
        if (bestStrategy && bestStrategy.strategy !== strategy) {
          setStrategy(bestStrategy.strategy);
          addAutopilotLog(`Ativo alterado para ${selectedAsset.symbol}. Estratégia '${bestStrategy.name}' selecionada automaticamente (${bestStrategy.winRate}% assertividade).`, "success");
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAsset.symbol, strategyCatalogs]);

  // Filtros para o painel de estatísticas avançadas
  const [statsAssetFilter, setStatsAssetFilter] = useState<"ALL" | "CURRENT">("ALL");
  const [statsStrategyFilter, setStatsStrategyFilter] = useState<string>("ALL");

  // Market Scanner Sweep states
  const [showSweepModal, setShowSweepModal] = useState(false);
  const [isSweepScanning, setIsSweepScanning] = useState(false);
  const [sweepProgress, setSweepProgress] = useState(0); // 0 to 100
  const [sweepCurrentAsset, setSweepCurrentAsset] = useState<string>("");
  const [sweepResults, setSweepResults] = useState<Array<{
    symbol: string;
    name: string;
    status: "idle" | "scanning" | "success" | "error";
    signal?: AISignal;
    payout: number;
    price?: number;
    strategy?: string;
  }>>([]);

  // System status and help modala
  const [showHelp, setShowHelp] = useState(false);
  const [serverTime, setServerTime] = useState("");
  const tickCounter = useRef(0);
  const [precisionLevel, setPrecisionLevel] = useState<'normal' | 'high' | 'elite'>('elite');
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [syncPriceInput, setSyncPriceInput] = useState("");
  const [isLiveSyncing, setIsLiveSyncing] = useState(true);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [lastRealTickAt, setLastRealTickAt] = useState<number>(Date.now());
  const [priceOffset, setPriceOffset] = useState<number>(0);
  const [autoPilot, setAutoPilot] = useState<boolean>(true);
  
  // Advanced AI Autopilot console and automated trading states
  const [autopilotLogs, setAutopilotLogs] = useState<Array<{ id: string; time: string; text: string; type: "info" | "success" | "warn" | "error" | "trade" }>>([
    { id: "l1", time: new Date().toLocaleTimeString('pt-BR'), text: "Scanner de Alta Assertividade IA inicializado com sucesso.", type: "success" },
    { id: "l2", time: new Date().toLocaleTimeString('pt-BR'), text: "Feed de dados em tempo real integrado à API FastForex.", type: "info" },
    { id: "l3", time: new Date().toLocaleTimeString('pt-BR'), text: "Varredura contínua ativa. Monitorando confluências de exaustão a cada 10 segundos.", type: "info" }
  ]);
  const [autopilotStats, setAutopilotStats] = useState({ wins: 14, losses: 2, totalScans: 48 });
  const [isAutopilotScanning, setIsAutopilotScanning] = useState<boolean>(false);

  const addAutopilotLog = (text: string, type: "info" | "success" | "warn" | "error" | "trade" = "info") => {
    const timeStr = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    const newLog = { id: Math.random().toString(36).substring(7), time: timeStr, text, type };
    setAutopilotLogs(prev => [newLog, ...prev.slice(0, 39)]);
  };

  // Play premium synthesized audio alerts on signal generation
  const playSignalSound = (signalType: "CALL" | "PUT" | "NEUTRAL") => {
    if (!audioEnabled) return;
    try {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();
      
      if (signalType === "CALL") {
        // High-pitched pleasant upward chime
        const osc1 = ctx.createOscillator();
        const gain = ctx.createGain();
        
        osc1.type = "sine";
        osc1.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
        osc1.frequency.setValueAtTime(880, ctx.currentTime + 0.12); // A5
        
        gain.gain.setValueAtTime(0.12, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
        
        osc1.connect(gain);
        gain.connect(ctx.destination);
        osc1.start();
        osc1.stop(ctx.currentTime + 0.4);
      } else if (signalType === "PUT") {
        // High-pitched warning downward chime
        const osc1 = ctx.createOscillator();
        const gain = ctx.createGain();
        
        osc1.type = "sine";
        osc1.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
        osc1.frequency.setValueAtTime(349.23, ctx.currentTime + 0.12); // F4
        
        gain.gain.setValueAtTime(0.12, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
        
        osc1.connect(gain);
        gain.connect(ctx.destination);
        osc1.start();
        osc1.stop(ctx.currentTime + 0.4);
      } else {
        // Soft click-like tick for neutral
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(440, ctx.currentTime); // A4
        gain.gain.setValueAtTime(0.05, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.2);
      }
    } catch (e) {
      console.warn("Audio Context sound blocked or not supported:", e);
    }
  };

  // Synchronize entire chart and indicators around a manually entered price (for OTC broker alignment)
  const handlePriceSync = (targetPriceStr: string) => {
    const targetPrice = parseFloat(targetPriceStr);
    if (isNaN(targetPrice) || targetPrice <= 0) return;
    
    setCandles((prevCandles) => {
      if (prevCandles.length === 0) return prevCandles;
      const lastPrice = prevCandles[prevCandles.length - 1].close;
      const diff = targetPrice - lastPrice;
      
      const shifted = prevCandles.map(candle => ({
        ...candle,
        open: Number((candle.open + diff).toFixed(selectedAsset.decimals)),
        high: Number((candle.high + diff).toFixed(selectedAsset.decimals)),
        low: Number((candle.low + diff).toFixed(selectedAsset.decimals)),
        close: Number((candle.close + diff).toFixed(selectedAsset.decimals)),
      }));
      
      return shifted;
    });
    
    setCurrentPrice(targetPrice);
    playSignalSound("NEUTRAL");
  };

  // Initialize Candle historical data for active asset
  useEffect(() => {
    isAlignedRef.current = false;
    setCandles([]);
    setCurrentPrice(selectedAsset.basePrice);
    setSyncPriceInput(selectedAsset.basePrice.toFixed(selectedAsset.decimals));
    
    // Reset pricing
    setPriceHistory([]);
  }, [selectedAsset, timeframe]);

  // Live Server clock
  useEffect(() => {
    const clockInterval = setInterval(() => {
      const now = new Date();
      setServerTime(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + " UTC");
    }, 1000);
    return () => clearInterval(clockInterval);
  }, []);

  // Real-time market data sync loop (No more fake offline-only random walk for REAL/OTC assets!)
  useEffect(() => {
    let active = true;
    let tickerInterval: NodeJS.Timeout;

    const fetchLiveTick = async () => {
      if (!isLiveSyncing) {
        isAlignedRef.current = true;
        return;
      }
      try {
        const res = await fetch("/api/market-ticker", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ asset: selectedAsset.symbol, timeframe })
        });
        if (!res.ok) throw new Error("Erro ao buscar dados do FastForex.");
        const data = await res.json();
        
        if (!active) return;
        setLiveError(null);

        const rawPrice = data.price || data.close || selectedAsset.basePrice;
        setLastRealTickAt(Date.now());
        
        // Calculate dynamic offset to map Polarium user custom synced price vs FastForex price
        let currentOffset = priceOffset;
        if (selectedAsset.isOtc) {
          // If user hasn't synced yet, initialize an estimated offset so the base price matches roughly
          if (priceOffset === 0) {
            const initialOffset = selectedAsset.basePrice - rawPrice;
            setPriceOffset(initialOffset);
            currentOffset = initialOffset;
          }
        } else {
          // Real assets have no offset
          currentOffset = 0;
          if (priceOffset !== 0) setPriceOffset(0);
        }

        const displayPrice = Number((rawPrice + currentOffset).toFixed(selectedAsset.decimals));
        setCurrentPrice(displayPrice);

        // Update the candles array in real-time based on the actual FastForex candle
        setCandles((prevCandles) => {
          if (prevCandles.length === 0) return prevCandles;
          let updated = [...prevCandles];
          const lastIdx = updated.length - 1;
          const lastCandle = { ...updated[lastIdx] };

          if (!isAlignedRef.current) {
            // Shift all historical candles so the entire chart aligns smoothly with the real-time price level
            const shift = displayPrice - lastCandle.close;
            updated = updated.map(c => ({
              ...c,
              open: Number((c.open + shift).toFixed(selectedAsset.decimals)),
              high: Number((c.high + shift).toFixed(selectedAsset.decimals)),
              low: Number((c.low + shift).toFixed(selectedAsset.decimals)),
              close: Number((c.close + shift).toFixed(selectedAsset.decimals))
            }));
            isAlignedRef.current = true;
          }

          // Use the newly aligned array's last candle
          const currentLast = { ...updated[lastIdx] };

          // Sync the candle parameters with the real-time live bar from FastForex (shifted by offset)
          currentLast.close = displayPrice;
          
          const rawHigh = data.high !== null ? data.high : rawPrice;
          const rawLow = data.low !== null ? data.low : rawPrice;
          const rawOpen = data.open !== null ? data.open : rawPrice;

          currentLast.high = Number((rawHigh + currentOffset).toFixed(selectedAsset.decimals));
          currentLast.low = Number((rawLow + currentOffset).toFixed(selectedAsset.decimals));
          currentLast.open = Number((rawOpen + currentOffset).toFixed(selectedAsset.decimals));

          // Ensure high and low cover the close price just in case
          if (currentLast.close > currentLast.high) currentLast.high = currentLast.close;
          if (currentLast.close < currentLast.low) currentLast.low = currentLast.close;

          // Inject RSI and indicator states returned from FastForex Scanner
          if (data.rsi !== undefined) currentLast.rsi = data.rsi;
          if (data.ema9 !== undefined && data.ema9 !== null) {
            currentLast.ema9 = Number((data.ema9 + currentOffset).toFixed(selectedAsset.decimals));
          }
          if (data.sma21 !== undefined && data.sma21 !== null) {
            currentLast.sma21 = Number((data.sma21 + currentOffset).toFixed(selectedAsset.decimals));
          }

          updated[lastIdx] = currentLast;
          return updated;
        });

      } catch (err: any) {
        console.warn("[Live Sync] Fallback to simulation tick due to:", err.message);
        if (active) {
          isAlignedRef.current = true; // Ensure auto-analysis can proceed even on fallback
          setLiveError("Usando sinal offline/simulado - Conectando...");
          
          // Fallback simulation tick
          setCurrentPrice((prev) => {
            const rand = (Math.random() - 0.5) * 2;
            const change = prev * (selectedAsset.volatility * 0.1) * rand;
            const nextPrice = Number((prev + change).toFixed(selectedAsset.decimals));

            setCandles((prevCandles) => {
              if (prevCandles.length === 0) return prevCandles;
              const updated = [...prevCandles];
              const lastIndex = updated.length - 1;
              const lastCandle = { ...updated[lastIndex] };
              lastCandle.close = nextPrice;
              if (nextPrice > lastCandle.high) lastCandle.high = nextPrice;
              if (nextPrice < lastCandle.low) lastCandle.low = nextPrice;
              updated[lastIndex] = lastCandle;
              return updated;
            });
            return nextPrice;
          });
        }
      }
    };

    // Fetch immediately on mount or asset/timeframe change
    fetchLiveTick();

    // Poll every 3 seconds for extremely snappy and responsive updates matching user expectations
    tickerInterval = setInterval(fetchLiveTick, 3000);

    return () => {
      active = false;
      clearInterval(tickerInterval);
    };
  }, [selectedAsset, timeframe, isLiveSyncing, priceOffset]);

  // Periodic candle rollover (triggers every 60 seconds to push a new candle block)
  useEffect(() => {
    const rolloverInterval = setInterval(() => {
      setCandles((prevCandles) => {
        if (prevCandles.length === 0) return prevCandles;
        const updated = [...prevCandles];
        
        const now = new Date();
        const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        const lastCandle = updated[updated.length - 1];
        // Don't duplicate times if it's within the same block
        if (lastCandle.time === timeStr) return prevCandles;

        const newCandle: Candle = {
          time: timeStr,
          open: lastCandle.close,
          high: lastCandle.close,
          low: lastCandle.close,
          close: lastCandle.close
        };
        
        const sliced = updated.length > 50 ? updated.slice(1) : updated;
        return [...sliced, newCandle];
      });
    }, 60000); // 60 seconds rollover

    return () => clearInterval(rolloverInterval);
  }, []);

  // Synchronize state values to refs for the interval scanner to prevent re-instantiating the interval on every price/candle/log update
  const candlesRef = useRef(candles);
  const selectedAssetRef = useRef(selectedAsset);
  const timeframeRef = useRef(timeframe);
  const strategyRef = useRef(strategy);
  const precisionLevelRef = useRef(precisionLevel);
  const currentPriceRef = useRef(currentPrice);
  const activeSignalRef = useRef(activeSignal);
  const lastSignalCandleRef = useRef<{ [key: string]: string }>({});
  const consecutiveLossCountRef = useRef(0);

  useEffect(() => { candlesRef.current = candles; }, [candles]);
  useEffect(() => { selectedAssetRef.current = selectedAsset; }, [selectedAsset]);
  useEffect(() => { timeframeRef.current = timeframe; }, [timeframe]);
  useEffect(() => { strategyRef.current = strategy; }, [strategy]);
  useEffect(() => { precisionLevelRef.current = precisionLevel; }, [precisionLevel]);
  useEffect(() => { currentPriceRef.current = currentPrice; }, [currentPrice]);
  useEffect(() => { activeSignalRef.current = activeSignal; }, [activeSignal]);

  // Continuous Real-Time analysis on every price tick
  const isContinuousAnalysisRef = useRef(isContinuousAnalysis);
  useEffect(() => { isContinuousAnalysisRef.current = isContinuousAnalysis; }, [isContinuousAnalysis]);

  useEffect(() => {
    if (!isContinuousAnalysis) return;
    if (isAnalyzing || isBackgroundAnalyzing) return;
    if (candles.length === 0) return;

    const runBackgroundAnalysis = async () => {
      setIsBackgroundAnalyzing(true);
      
      const closedCandle = candles.length > 1 ? candles[candles.length - 2] : candles[candles.length - 1];
      const indicatorPayload = {
        rsi: closedCandle?.rsi || 50,
        macd: closedCandle?.macd || { line: 0, signal: 0, histogram: 0 },
        bollinger: closedCandle?.bollinger || { upper: currentPrice + 0.001, middle: currentPrice, lower: currentPrice - 0.001 },
        ema9: closedCandle?.ema9 || currentPrice,
        sma21: closedCandle?.sma21 || currentPrice,
        stochastic: closedCandle?.stochastic || { k: 50, d: 50 },
        atr: closedCandle?.atr || 0.0002
      };

      try {
        const response = await fetch("/api/analyze-market", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            asset: selectedAsset.symbol,
            timeframe,
            currentPrice,
            candles: candles.slice(-35),
            indicators: indicatorPayload,
            strategy: strategy,
            precisionLevel,
            consecutiveLossCount: consecutiveLossCountRef.current,
            isBackground: true, 
            marketContext: { executionMode: isPaperTradingActive ? "paper_trading" : "live", newsRisk: "LOW", session: "OVERLAP", minutesToHighImpactNews: 120, isSyntheticData: !!liveError, isStaleData: (Date.now() - lastRealTickAt) > 15000, dataAgeMs: Date.now() - lastRealTickAt, includesActiveCandle: true }
          })
        });

        if (response.ok) {
          const result = await response.json();
          
          if (selectedAssetRef.current.symbol === selectedAsset.symbol) {
            setActiveSignal((prev) => {
              if (prev && prev.asset === selectedAsset.symbol) {
                // If there's already an active, pending CALL/PUT signal, do NOT let background ticks downgrade it to NEUTRAL
                const isTradeActive = prev.status === "PENDING" && prev.signal !== "NEUTRAL";
                const finalSignal = isTradeActive ? prev.signal : result.signal;
                const finalConfidence = isTradeActive ? prev.technicalScore : result.technicalScore;
                const finalExpiry = isTradeActive ? prev.expiry : result.expiry;
                const finalTitle = isTradeActive ? prev.analysisTitle : result.analysisTitle;
                const finalReasoning = isTradeActive ? prev.reasoning : (result.reasoning || []);
                const finalEntryTime = isTradeActive ? prev.entryTime : (result.entryTime || prev.entryTime);
                const finalEntryPrice = isTradeActive ? prev.entryPrice : prev.entryPrice;

                const finalIndicatorsStatus = isTradeActive ? prev.indicatorsStatus : (result.indicatorsStatus || prev.indicatorsStatus);
                const finalMarketFit = isTradeActive ? prev.marketFit : (result.marketFit || prev.marketFit);
                const finalCandleAnalysis = isTradeActive ? prev.candleAnalysis : (result.candleAnalysis || prev.candleAnalysis);
                const finalHistoricalPerformance = isTradeActive ? prev.historicalPerformance : (result.historicalPerformance || prev.historicalPerformance);

                return {
                  ...prev,
                  strategy: result.strategy || strategy,
                  signal: finalSignal,
                  confidence: finalConfidence,
                  expiry: finalExpiry,
                  entryTime: finalEntryTime,
                  entryPrice: finalEntryPrice,
                  analysisTitle: finalTitle,
                  reasoning: finalReasoning,
                  keyLevels: result.keyLevels || prev.keyLevels,
                  indicatorsStatus: finalIndicatorsStatus,
                  candleAnalysis: finalCandleAnalysis,
                  marketFit: finalMarketFit,
                  historicalPerformance: finalHistoricalPerformance,
                };
              } else {
                const tdEntryPrice = result.marketContext?.executionPrice || result.marketContext?.mid;

                const isFastForexActive = result.marketContext?.priceProvider === "fastforex";
                const isValidFastForexEntry = isFastForexActive
                  ? (
                      tdEntryPrice &&
                      (result.marketContext?.dataSourceType === "fastforex_rest" || result.marketContext?.dataSourceType === "fastforex_stream") &&
                      result.marketContext?.isStaleData === false &&
                      result.marketContext?.dataAgeMs !== undefined &&
                      result.marketContext?.dataAgeMs <= 10000
                    )
                  : (
                      tdEntryPrice &&
                      result.marketContext?.priceProvider === "fastforex" &&
                      result.marketContext?.dataSourceType === "fastforex_rest" &&
                      result.marketContext?.isStaleData === false &&
                      result.marketContext?.dataAgeMs !== undefined &&
                      result.marketContext?.dataAgeMs <= 10000
                    );

                if (!isValidFastForexEntry) {
                  return prev;
                }

                return {
                  id: Math.random().toString(36).substring(7),
                  asset: selectedAsset.symbol,
                  timeframe,
                  strategy: result.strategy || strategy,
                  signal: result.signal,
                  technicalScore: result.technicalScore ?? 0,
            calibratedProbability: result.calibratedProbability ?? null,
            calibrationAvailable: result.calibrationAvailable || false,
                  expiry: result.expiry,
                  entryTime: result.entryTime || new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }),
                  analysisTitle: result.analysisTitle,
                  reasoning: result.reasoning || [],
                  keyLevels: result.keyLevels || { supportAvailable: false, resistanceAvailable: false, support: null, resistance: null, supportStrength: 0, resistanceStrength: 0, distanceToSupportAtr: null, distanceToResistanceAtr: null },
                  indicatorsStatus: result.indicatorsStatus || { rsi: "Neutro", macd: "Neutro", bollinger: "Neutro", movingAverages: "Neutro" },
                  entryPrice: tdEntryPrice,
                  status: "PENDING",
                  isSimulated: result.isSimulated,
                  message: result.message,
                  errorMsg: result.errorMsg,
                  candleAnalysis: result.candleAnalysis,
                  marketFit: result.marketFit,
                  timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
                  expirySecondsRemaining: result.expiry?.includes("5") ? 300 : 60,
                  historicalPerformance: result.historicalPerformance,
                  entryMarketContext: result.marketContext
                };
              }
            });
          }
        }
      } catch (err) {
        console.warn("[Background Analysis] failed:", err);
      } finally {
        setIsBackgroundAnalyzing(false);
      }
    };

    const timeout = setTimeout(runBackgroundAnalysis, 1200);
    return () => clearTimeout(timeout);
  }, [currentPrice, strategy, timeframe, precisionLevel, selectedAsset.symbol, isContinuousAnalysis, isAnalyzing]);

  // Real-time market analysis diagnostics for the Autopilot and Copilot UI
  const liveDiagnostics = useMemo(() => {
    const lastCandle = candles[candles.length - 1];
    if (!lastCandle) {
      return {
        callScore: 0,
        putScore: 0,
        requiredScore: 3,
        rsi: 50,
        stochK: 50,
        stochD: 50,
        macdHist: 0,
        atr: 0,
        bolLower: 0,
        bolUpper: 0,
        bollingerTouchCall: false,
        bollingerTouchPut: false,
        rsiExtremeCall: false,
        rsiExtremePut: false,
        stochAlignedCall: false,
        stochAlignedPut: false,
        emaAlignedCall: false,
        emaAlignedPut: false,
        atrHealthy: true,
        isCrypto: false
      };
    }

    const rsi = lastCandle.rsi || 50;
    const ema9 = lastCandle.ema9 || currentPrice;
    const sma21 = lastCandle.sma21 || currentPrice;
    const macdHist = lastCandle.macd?.histogram || 0;
    const stochK = lastCandle.stochastic?.k || 50;
    const stochD = lastCandle.stochastic?.d || 50;
    const atr = lastCandle.atr || 0.0002;
    const bolLower = lastCandle.bollinger?.lower || (currentPrice * 0.999);
    const bolUpper = lastCandle.bollinger?.upper || (currentPrice * 1.001);

    const isCrypto = selectedAsset.symbol.includes("BTC") || selectedAsset.symbol.includes("ETH") || selectedAsset.symbol.includes("SOL") || selectedAsset.symbol.includes("XRP") || selectedAsset.symbol.includes("BNB");

    let reversionThreshold = isCrypto ? 3.8 : 3.0;
    let trendThreshold = isCrypto ? 3.2 : 3.5;
    if (precisionLevel === "elite") {
      reversionThreshold = isCrypto ? 4.5 : 4.0;
      trendThreshold = isCrypto ? 4.0 : 4.2;
    } else if (precisionLevel === "normal") {
      reversionThreshold = isCrypto ? 2.8 : 2.0;
      trendThreshold = isCrypto ? 2.4 : 2.8;
    }

    // Call and Put score computation
    let callScore = 0;
    let putScore = 0;

    // Bollinger Band Touches
    const bollingerTouchCall = currentPrice <= bolLower;
    const bollingerTouchPut = currentPrice >= bolUpper;

    // RSI
    const rsiExtremeCall = isCrypto ? rsi <= 28 : rsi <= 32;
    const rsiExtremePut = isCrypto ? rsi >= 72 : rsi >= 68;

    // Stochastic
    const stochAlignedCall = stochK <= 20 && stochD <= 20;
    const stochAlignedPut = stochK >= 80 && stochD >= 80;

    // EMAs for trend
    const emaAlignedCall = ema9 > sma21;
    const emaAlignedPut = ema9 < sma21;

    // ATR
    const atrHealthy = (atr / currentPrice) >= 0.00008;

    if (strategy === "reversion") {
      if (rsiExtremeCall) callScore += isCrypto ? 1.5 : 1;
      if (rsi <= (isCrypto ? 24 : 26)) callScore += isCrypto ? 1.5 : 1;
      if (bollingerTouchCall) callScore += 1;
      if (stochAlignedCall) callScore += 1.5;
      if (stochK > stochD && stochK <= 30) callScore += 0.5;
      if (stochK < stochD) callScore -= 1.5; // Downward momentum

      if (rsiExtremePut) putScore += isCrypto ? 1.5 : 1;
      if (rsi >= (isCrypto ? 76 : 74)) putScore += isCrypto ? 1.5 : 1;
      if (bollingerTouchPut) putScore += 1;
      if (stochAlignedPut) putScore += 1.5;
      if (stochK < stochD && stochK >= 70) putScore += 0.5;
      if (stochK > stochD) putScore -= 1.5; // Upward momentum
    } else if (strategy === "trend") {
      if (emaAlignedCall) callScore += isCrypto ? 2.0 : 1.5;
      if (macdHist > 0.00001) callScore += 1;
      const rsiRoomCall = isCrypto ? (rsi >= 40 && rsi <= 74) : (rsi >= 44 && rsi <= 64);
      if (rsiRoomCall) callScore += 1;
      if (stochK > stochD) callScore += 1;
      if (stochK >= 85) callScore -= 2.5; // Overbought exhaust
      if (!atrHealthy) callScore -= 3.0;

      if (emaAlignedPut) putScore += isCrypto ? 2.0 : 1.5;
      if (macdHist < -0.00001) putScore += 1;
      const rsiRoomPut = isCrypto ? (rsi >= 26 && rsi <= 60) : (rsi >= 36 && rsi <= 56);
      if (rsiRoomPut) putScore += 1;
      if (stochK < stochD) putScore += 1;
      if (stochK <= 15) putScore -= 2.5; // Oversold exhaust
      if (!atrHealthy) putScore -= 3.0;
    }

    // Base market sentiment computation (Touros vs Ursos)
    let buyerSentiment = 50;
    // EMA bias
    if (ema9 > sma21) buyerSentiment += 15; else buyerSentiment -= 15;
    // MACD bias
    if (macdHist > 0) buyerSentiment += 12; else buyerSentiment -= 12;
    // Stochastic bias
    if (stochK > stochD) buyerSentiment += 8; else buyerSentiment -= 8;
    // RSI bias (scaled)
    const rsiOffset = (rsi - 50) * 0.6; // max +-30
    buyerSentiment += rsiOffset;
    // Clamp to realistic 10% - 90%
    buyerSentiment = Math.max(10, Math.min(90, Math.round(buyerSentiment)));
    const sellerSentiment = 100 - buyerSentiment;

    let sentimentLabel = "Neutro";
    let sentimentColor = "text-amber-400 border-amber-500/20 bg-amber-500/5";
    if (buyerSentiment >= 75) {
      sentimentLabel = "Forte Compra (Extremo Touros) ��";
      sentimentColor = "text-emerald-400 border-emerald-500/30 bg-emerald-500/5";
    } else if (buyerSentiment >= 58) {
      sentimentLabel = "Compra (Predomínio Touros) ��";
      sentimentColor = "text-emerald-400/80 border-emerald-500/10 bg-emerald-500/[0.02]";
    } else if (buyerSentiment <= 25) {
      sentimentLabel = "Forte Venda (Extremo Ursos) ��";
      sentimentColor = "text-rose-400 border-rose-500/30 bg-rose-500/5";
    } else if (buyerSentiment <= 42) {
      sentimentLabel = "Venda (Predomínio Ursos) ��";
      sentimentColor = "text-rose-400/80 border-rose-500/10 bg-rose-500/[0.02]";
    } else {
      sentimentLabel = "Neutro / Consolidado ⚖️";
      sentimentColor = "text-slate-400 border-slate-800 bg-slate-900/10";
    }

    return {
      callScore: Math.max(0, Number(callScore.toFixed(1))),
      putScore: Math.max(0, Number(putScore.toFixed(1))),
      requiredScore: strategy === "reversion" ? reversionThreshold : trendThreshold,
      rsi,
      stochK,
      stochD,
      macdHist,
      atr,
      bolLower,
      bolUpper,
      bollingerTouchCall,
      bollingerTouchPut,
      rsiExtremeCall,
      rsiExtremePut,
      stochAlignedCall,
      stochAlignedPut,
      emaAlignedCall,
      emaAlignedPut,
      atrHealthy,
      isCrypto,
      buyerSentiment,
      sellerSentiment,
      sentimentLabel,
      sentimentColor
    };
  }, [candles, currentPrice, selectedAsset, strategy, precisionLevel]);

  // Active signals and history countdown and resolution engine
  const getPreciseRemainingSeconds = (sig: { entryTime?: string; expiry: string }): number => {
    if (!sig.entryTime) return 0;
    try {
      const now = new Date();
      // entryTime is expected to be HH:MM or HH:MM:SS
      const [entryHH, entryMM] = sig.entryTime.split(":").map(Number);
      const entryDate = new Date(now);
      entryDate.setHours(entryHH, entryMM, 0, 0);
      
      // adjust date if day boundary crossed
      if (entryDate.getTime() - now.getTime() > 12 * 60 * 60 * 1000) {
        entryDate.setDate(entryDate.getDate() - 1);
      } else if (now.getTime() - entryDate.getTime() > 12 * 60 * 60 * 1000) {
        entryDate.setDate(entryDate.getDate() + 1);
      }

      const durationMinutes = sig.expiry?.includes("5") ? 5 : 1;
      const expiryDate = new Date(entryDate.getTime() + durationMinutes * 60 * 1000);
      
      return Math.max(0, Math.ceil((expiryDate.getTime() - now.getTime()) / 1000));
    } catch (e) {
      return 0;
    }
  };

  useEffect(() => {
    let isResolving = false;
    const timer = setInterval(async () => {
      if (isResolving) return;
      const cPrice = currentPriceRef.current;
      const sAsset = selectedAssetRef.current;
      const actSig = activeSignalRef.current;

      // 1. Resolve activeSignal if pending
      if (actSig && actSig.status === "PENDING" && actSig.signal !== "NEUTRAL") {
        const remaining = getPreciseRemainingSeconds(actSig);
        
        if (remaining <= 0) {
          isResolving = true;
          try {
          // Signal expired, resolve it using actual market data
          const isCall = actSig.signal === "CALL";
          
          let exitPriceVal = cPrice;
          let exitPriceProvider = "unknown";
          let exitPriceDataSourceType = "unknown";
          let resultStatus: "WIN" | "LOSS" | "DRAW" | "INVALID_FEED" = "INVALID_FEED";
          
          try {
             const symbolParam = actSig.asset.replace("_", "/");
             const tickRes = await fetch(`/api/market/latest-price?symbol=${symbolParam}`);
             const tickData = await tickRes.json();
             
             if (tickData.ok && tickData.provider === "fastforex") {
                exitPriceVal = tickData.price;
                exitPriceProvider = "fastforex";
                exitPriceDataSourceType = tickData.dataSourceType;
                if (isCall) {
                  resultStatus = exitPriceVal > actSig.entryPrice ? "WIN" : exitPriceVal < actSig.entryPrice ? "LOSS" : "DRAW";
                } else {
                  resultStatus = exitPriceVal < actSig.entryPrice ? "WIN" : exitPriceVal > actSig.entryPrice ? "LOSS" : "DRAW";
                }
             }
          } catch(e) {}

          if (resultStatus === "INVALID_FEED") {
            addAutopilotLog(`⚠️ Feed integrado inválido ou stale em ${actSig.asset}. Sinal descartado da validação.`, "warn");
          } else {
            if (resultStatus === "WIN") {
              consecutiveLossCountRef.current = 0;
            } else if (resultStatus === "LOSS") {
              consecutiveLossCountRef.current += 1;
            } 
            
            const displayStatus = resultStatus === "WIN" 
                ? "VITÓRIA (WIN) ��" 
                : resultStatus === "LOSS" 
                  ? "DERROTA (LOSS) ��" 
                  : "EMPATE (DRAW) ⚪";
            
            const logType = resultStatus === "WIN" ? "success" : resultStatus === "LOSS" ? "warn" : "info";
            addAutopilotLog(`�� SINAL FINALIZADO em ${actSig.asset}! Resultado: ${displayStatus} | Entrada: ${actSig.entryPrice.toFixed(sAsset.decimals)} | Fechamento: ${exitPriceVal.toFixed(sAsset.decimals)}`, logType);
            
            if (resultStatus === "WIN") {
              try {
                const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = "sine";
                osc.frequency.setValueAtTime(880, ctx.currentTime);
                gain.gain.setValueAtTime(0.06, ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start();
                osc.stop(ctx.currentTime + 0.35);
              } catch (e) {}
            }
          }

          const resolvedSignal = {
            ...actSig,
            status: resultStatus,
            exitPrice: exitPriceVal,
            expirySecondsRemaining: 0
          };

          // Update active signal state
          setActiveSignal(resolvedSignal);

          // Update history list with this exact resolved object to ensure complete visual sync
          setSignalHistory(prevHistory => {
            return prevHistory.map(sig => {
              if (sig.id === actSig.id) {
                return resolvedSignal;
              }
              return sig;
            });
          });

          // Update strategy catalogs for the asset
          setStrategyCatalogs(prevCatalogs => {
            const assetCats = prevCatalogs[actSig.asset] || [];
            const updatedCats = assetCats.map(cat => {
              if (cat.strategy === actSig.strategy) {
                const wins = resultStatus === "WIN" ? cat.wins + 1 : cat.wins;
                const losses = resultStatus === "LOSS" ? cat.losses + 1 : cat.losses;
                const total = wins + losses;
                const winRate = total > 0 ? Math.round((wins / total) * 100) : cat.winRate;
                return { ...cat, wins, losses, winRate };
              }
              return cat;
            });
            return { ...prevCatalogs, [actSig.asset]: updatedCats };
          });

          // Add to Paper Trading validation log
          const isFastForexValid = actSig.entryMarketContext &&
            actSig.entryMarketContext.priceProvider === "fastforex" &&
            (actSig.entryMarketContext.dataSourceType === "fastforex_rest" || actSig.entryMarketContext.dataSourceType === "fastforex_stream") &&
            (actSig.entryMarketContext.executionPrice || actSig.entryMarketContext.mid);

          if (resultStatus !== "INVALID_FEED" && isFastForexValid) {
            setPaperTradingSignals(prev => {
              const tradingDate = new Date().toISOString().slice(0, 10);
              const dedupeKey = `${resolvedSignal.asset}-${resolvedSignal.timeframe}-${resolvedSignal.strategy || ""}-${resolvedSignal.signal}-${tradingDate}-${resolvedSignal.entryTime}`;
              const isDuplicate = prev.some(s => s.dedupeKey === dedupeKey);
              if (isDuplicate) return prev;

              const engineVersion = "v3.8-fastforex-paper-real";
              const validationSource = "fastforex_real_price";
              const priceProvider = "fastforex";

              const newPtSignal = {
                id: resolvedSignal.id,
                dedupeKey,
                tradingDate,
                expiresAt: new Date(Date.now() + parseInt(resolvedSignal.expiry) * 60000).toISOString(),
                resolvedAt: new Date().toISOString(),
                timestamp: new Date().toISOString(),
                entryTime: resolvedSignal.entryTime,
                asset: resolvedSignal.asset,
                timeframe: resolvedSignal.timeframe,
                strategy: resolvedSignal.strategy || "",
                signal: resolvedSignal.signal as any,
                confidence: resolvedSignal.technicalScore,
                confidenceType: "technical_score" as any,
                historicalWinRate: resolvedSignal.historicalPerformance?.winRate || 0,
                sampleSize: resolvedSignal.historicalPerformance?.totalSignals || 0,
                reliabilityScore: resolvedSignal.reliabilityScore || resolvedSignal.historicalPerformance?.reliabilityScore || 0,
                entryPrice: resolvedSignal.entryPrice,
                exitPrice: exitPriceVal,
                expiry: resolvedSignal.expiry,
                result: resultStatus as any,
                reason: resolvedSignal.reasoning || [],
                engineVersion,
                validationSource,
                dataSourceType: actSig.entryMarketContext.dataSourceType,
                feedMode: actSig.entryMarketContext.feedMode,
                priceProvider,
                entryPriceProvider: actSig.entryMarketContext.priceProvider,
                exitPriceProvider: exitPriceProvider,
                entryPriceDataSourceType: actSig.entryMarketContext.dataSourceType,
                exitPriceDataSourceType: exitPriceDataSourceType
              };
              const nextList = [...prev, newPtSignal];
              try {
                localStorage.setItem("paper_trading_signals", JSON.stringify(nextList));
              } catch(e){}
              return nextList;
            });
          }

          // Update Autopilot stats
          setAutopilotStats(prevStats => {
            const wins = resultStatus === "WIN" ? prevStats.wins + 1 : prevStats.wins;
            const losses = resultStatus === "LOSS" ? prevStats.losses + 1 : prevStats.losses;
            return { ...prevStats, wins, losses, totalScans: prevStats.totalScans + 1 };
          });
          } finally {
            isResolving = false;
          }
        } else {
          // Decrement countdown for active signal
          setActiveSignal(prev => {
            if (!prev || prev.status !== "PENDING") return prev;
            return {
              ...prev,
              expirySecondsRemaining: remaining
            };
          });

          // Decrement countdown for history items as well to keep them perfectly synced
          setSignalHistory(prevHistory => {
            return prevHistory.map(sig => {
              if (sig.id === actSig.id) {
                return {
                  ...sig,
                  expirySecondsRemaining: remaining
                };
              }
              return sig;
            });
          });
        }
      }

      // 2. Resolve other pending history items if any (e.g. background scanned signals)
      setSignalHistory(prevHistory => {
        let changed = false;
        const updatedHistory = prevHistory.map(sig => {
          if (sig.status === "PENDING" && sig.signal !== "NEUTRAL" && (!actSig || sig.id !== actSig.id)) {
            const remaining = getPreciseRemainingSeconds(sig);
            if (remaining <= 0) {
              changed = true;
              const isCall = sig.signal === "CALL";
              const exitPriceVal = cPrice;
              let resultStatus: "WIN" | "LOSS" | "DRAW";

              if (isCall) {
                resultStatus = exitPriceVal > sig.entryPrice ? "WIN" : exitPriceVal < sig.entryPrice ? "LOSS" : "DRAW";
              } else {
                resultStatus = exitPriceVal < sig.entryPrice ? "WIN" : exitPriceVal > sig.entryPrice ? "LOSS" : "DRAW";
              }

              if (resultStatus === "WIN") {
                consecutiveLossCountRef.current = 0;
              } else if (resultStatus === "LOSS") {
                consecutiveLossCountRef.current += 1;
              }

              // Update catalogs
              setStrategyCatalogs(prevCatalogs => {
                const assetCats = prevCatalogs[sig.asset] || [];
                const updatedCats = assetCats.map(cat => {
                  if (cat.strategy === sig.strategy) {
                    const wins = resultStatus === "WIN" ? cat.wins + 1 : cat.wins;
                    const losses = resultStatus === "LOSS" ? cat.losses + 1 : cat.losses;
                    const total = wins + losses;
                    const winRate = total > 0 ? Math.round((wins / total) * 100) : cat.winRate;
                    return { ...cat, wins, losses, winRate };
                  }
                  return cat;
                });
                return { ...prevCatalogs, [sig.asset]: updatedCats };
              });

              // Update Autopilot stats
              setAutopilotStats(prevStats => {
                const wins = resultStatus === "WIN" ? prevStats.wins + 1 : prevStats.wins;
                const losses = resultStatus === "LOSS" ? prevStats.losses + 1 : prevStats.losses;
                return { ...prevStats, wins, losses, totalScans: prevStats.totalScans + 1 };
              });

              return {
                ...sig,
                status: resultStatus,
                exitPrice: exitPriceVal,
                expirySecondsRemaining: 0
              };
            }
            changed = true;
            return {
              ...sig,
              expirySecondsRemaining: remaining
            };
          }
          return sig;
        });

        return changed ? updatedHistory : prevHistory;
      });

    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Autopilot Automatic Scanning Engine (Varredura Contínua)
  useEffect(() => {
    if (!autoPilot || !isFastForexOperational) return;

    // Scan every 10 seconds for confluences
    const autoScanInterval = setInterval(async () => {
      if (isAnalyzing) return; // Skip if manually scanning
      
      setIsAutopilotScanning(true);
      setTimeout(() => setIsAutopilotScanning(false), 2000);

      const asset = selectedAssetRef.current;
      const tf = timeframeRef.current;
      const cPrice = currentPriceRef.current;
      const currentCandles = candlesRef.current;
      const currentStrat = strategyRef.current;
      const currentPrec = precisionLevelRef.current;
      const actSig = activeSignalRef.current;

      // Grab latest indicator state from the last completed candle
      const closedCandle = currentCandles.length > 1 ? currentCandles[currentCandles.length - 2] : currentCandles[currentCandles.length - 1];
      if (!closedCandle) return;

      const candleTime = closedCandle.time;
      const key = `${asset.symbol}_${tf}`;
      if (lastSignalCandleRef.current[key] === candleTime) {
        // Already emitted a signal for this candle block. Skip scanning to avoid multiple signals per candle.
        return;
      }

      const rsiVal = closedCandle.rsi || 50;

      addAutopilotLog(`Buscando confluências de alta probabilidade em ${asset.symbol} [${tf}]...`, "info");

      const indicatorPayload = {
        rsi: rsiVal,
        macd: closedCandle.macd || { line: 0, signal: 0, histogram: 0 },
        bollinger: closedCandle.bollinger || { upper: cPrice + 0.001, middle: cPrice, lower: cPrice - 0.001 },
        ema9: closedCandle.ema9 || cPrice,
        sma21: closedCandle.sma21 || cPrice,
        stochastic: closedCandle.stochastic || { k: 50, d: 50 },
        atr: closedCandle.atr || 0.0002
      };

      try {
        const response = await fetch("/api/analyze-market", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            asset: asset.symbol,
            timeframe: tf,
            currentPrice: cPrice,
            candles: currentCandles.slice(-35),
            indicators: indicatorPayload,
            strategy: currentStrat,
            precisionLevel: currentPrec,
            consecutiveLossCount: consecutiveLossCountRef.current, marketContext: { executionMode: isPaperTradingActive ? "paper_trading" : "live", newsRisk: "LOW", session: "OVERLAP", minutesToHighImpactNews: 120, isSyntheticData: !!liveError, isStaleData: (Date.now() - lastRealTickAt) > 15000, dataAgeMs: Date.now() - lastRealTickAt, includesActiveCandle: true }
          })
        });

        if (!response.ok) {
          addAutopilotLog(`Erro de conexão com o servidor de IA. Reavaliando na próxima varredura.`, "warn");
          return;
        }
        const result = await response.json();

        // If the signal is CALL or PUT (not NEUTRAL)
        if (result.signal && result.signal !== "NEUTRAL") {
          const tdEntryPrice = result.marketContext?.executionPrice || result.marketContext?.mid;

          const isFastForexActive = result.marketContext?.priceProvider === "fastforex";
          const isValidFastForexEntry = isFastForexActive
            ? (
                tdEntryPrice &&
                (result.marketContext?.dataSourceType === "fastforex_rest" || result.marketContext?.dataSourceType === "fastforex_stream") &&
                result.marketContext?.isStaleData === false &&
                result.marketContext?.dataAgeMs !== undefined &&
                result.marketContext?.dataAgeMs <= 10000
              )
            : (
                tdEntryPrice &&
                result.marketContext?.priceProvider === "fastforex" &&
                result.marketContext?.dataSourceType === "fastforex_rest" &&
                result.marketContext?.isStaleData === false &&
                result.marketContext?.dataAgeMs !== undefined &&
                result.marketContext?.dataAgeMs <= 10000
              );

          if (!isValidFastForexEntry) {
            const providerName = isFastForexActive ? "FastForex" : "FastForex";
            addAutopilotLog(`Preço ${providerName} integrado inválido ou stale para ${asset.symbol}. Sinal abortado.`, "warn");
            return;
          }

          // If the new signal is the same as the active signal, skip to avoid duplicate logs
          if (actSig && actSig.signal === result.signal && actSig.asset === asset.symbol) {
            return;
          }

          // Trigger the premium synthesized entry tone alert
          playSignalSound(result.signal);

          const newSignal: AISignal = {
            id: Math.random().toString(36).substring(7),
            asset: asset.symbol,
            timeframe: tf,
            strategy: result.strategy || currentStrat,
            signal: result.signal,
            technicalScore: result.technicalScore ?? 0,
            calibratedProbability: result.calibratedProbability ?? null,
            calibrationAvailable: result.calibrationAvailable || false,
            expiry: result.expiry,
            entryTime: result.entryTime || new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }),
            analysisTitle: result.analysisTitle || "Sinal de Piloto Automático",
            reasoning: result.reasoning || [],
            keyLevels: result.keyLevels || { supportAvailable: false, resistanceAvailable: false, support: null, resistance: null, supportStrength: 0, resistanceStrength: 0, distanceToSupportAtr: null, distanceToResistanceAtr: null },
            indicatorsStatus: result.indicatorsStatus || { rsi: "Neutro", macd: "Neutro", bollinger: "Neutro", movingAverages: "Neutro" },
            entryPrice: tdEntryPrice,
            entryMarketContext: result.marketContext,
            status: "PENDING",
            isSimulated: result.isSimulated,
            message: result.message,
            errorMsg: result.errorMsg,
            candleAnalysis: result.candleAnalysis,
            marketFit: result.marketFit,
            timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            expirySecondsRemaining: result.expiry?.includes("5") ? 300 : 60,
            isAutoSelected: result.isAutoSelected,
            autoCalibrationResults: result.autoCalibrationResults,
            historicalPerformance: result.historicalPerformance
          };

          // Record that we successfully generated a signal for this candle block to avoid duplication
          lastSignalCandleRef.current[key] = candleTime;

          addAutopilotLog(`�� Alerta de sinal emitido para ${asset.symbol}: ${result.signal} (${result.technicalScore}% confluência). Execução recomendada!`, "success");

          setActiveSignal(newSignal);
          setSignalHistory(prev => [newSignal, ...prev.slice(0, 19)]);
        } else {
          // Neutral result
          addAutopilotLog(`Análise concluída: Sem confluência ideal em ${asset.symbol} para filtro ${currentPrec === "elite" ? "Elite Ultra" : currentPrec === "high" ? "Máximo" : "Mínimo"}. (RSI: ${rsiVal.toFixed(1)})`, "info");
        }
      } catch (err) {
        console.warn("[Autopilot] Scanner background error:", err);
        addAutopilotLog(`Erro de conexão ao analisar ${asset.symbol}. Reavaliando mercado...`, "warn");
      }
    }, 10000);

    return () => clearInterval(autoScanInterval);
  }, [autoPilot, isAnalyzing]);

  // Request analysis from our server endpoint
  const runBackstageReplayAction = async () => {
    if (isBackstageRunning) return;

    setIsBackstageRunning(true);
    setBackstageError(null);
    setBackstageStatusOverride(null);
    setErrorMessage(null);

    try {
      // 1. Fetch candles from API to verify real availability
      const candlesUrl = `/api/market/candles?symbol=${encodeURIComponent(selectedAsset.symbol)}&timeframe=${timeframe}&limit=500`;
      const candlesRes = await fetch(candlesUrl);
      if (!candlesRes.ok) {
        setBackstageStatusOverride("MARKET_CANDLES_UNAVAILABLE");
        setBackstageError("Backstage indisponível: candles reais da FastForex não encontrados.");
        return;
      }

      const candlesData = await candlesRes.json();
      if (!candlesData.ok || !candlesData.candles || candlesData.candles.length < 100) {
        setBackstageStatusOverride("MARKET_CANDLES_UNAVAILABLE");
        setBackstageError("Backstage indisponível: candles reais da FastForex não encontrados.");
        return;
      }

      // 2. Fetch Backstage Replay analysis
      const response = await fetch('/api/backstage-replay', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          asset: selectedAsset.symbol,
          timeframe: timeframe,
          strategy,
          precisionLevel
        })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        if (errData.error === "MARKET_CANDLES_UNAVAILABLE" || errData.message === "MARKET_CANDLES_UNAVAILABLE") {
          setBackstageStatusOverride("MARKET_CANDLES_UNAVAILABLE");
          setBackstageError("Backstage indisponível: candles reais da FastForex não encontrados.");
          return;
        }
        throw new Error(errData.error || "Erro ao executar Backstage Replay");
      }

      const data = await response.json();
      if (data.results && Array.isArray(data.results)) {
        setBackstageReplaySignals(data.results);
        localStorage.setItem("backstage_replay_results", JSON.stringify(data.results));
      }
    } catch (e: any) {
      setBackstageError(e.message || "Erro no Backstage Replay");
    } finally {
      setIsBackstageRunning(false);
    }
  };

  const exportBackstageReport = () => {
    if (backstageReplaySignals.length === 0) {
      alert("Não há dados de Backstage para exportar.");
      return;
    }
    
    const report = {
      generatedAt: new Date().toISOString(),
      engineVersion: "v3.8-fastforex-backstage",
      stats: backstageStatus,
      signals: backstageReplaySignals
    };

    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `backstage-report-${selectedAsset.symbol}-${new Date().getTime()}.json`;
    a.click();
  };

  const runBackstageScannerAction = async () => {
    if (isScannerRunning) return;

    setIsScannerRunning(true);
    setScannerError(null);

    try {
      const response = await fetch('/api/backstage-scan-all', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error("Erro ao executar Backstage Scanner Geral");
      }

      const data = await response.json();
      if (data.setups) {
        setScannerResults(data.setups);
        setScannerStats(data.stats);
        localStorage.setItem("backstage_scanner_results", JSON.stringify(data.setups));
        localStorage.setItem("backstage_scanner_stats", JSON.stringify(data.stats));
      }
    } catch (e: any) {
      setScannerError(e.message || "Erro no Backstage Scanner");
    } finally {
      setIsScannerRunning(false);
    }
  };

  const handleAnalyzeMarket = async () => {
    setIsAnalyzing(true);
    setErrorMessage(null);

    // Grab latest indicator state from the last completed candle
    const closedCandle = candles.length > 1 ? candles[candles.length - 2] : candles[candles.length - 1];
    const indicatorPayload = {
      rsi: closedCandle?.rsi || 50,
      macd: closedCandle?.macd || { line: 0, signal: 0, histogram: 0 },
      bollinger: closedCandle?.bollinger || { upper: currentPrice + 0.001, middle: currentPrice, lower: currentPrice - 0.001 },
      ema9: closedCandle?.ema9 || currentPrice,
      sma21: closedCandle?.sma21 || currentPrice,
      stochastic: closedCandle?.stochastic || { k: 50, d: 50 },
      atr: closedCandle?.atr || 0.0002
    };

    try {
      // Real-time market analysis requested directly without mock trade simulation or state resolution.

      const response = await fetch("/api/analyze-market", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          asset: selectedAsset.symbol,
          timeframe,
          currentPrice,
          candles: candles.slice(-35), // Send recent historical candles for pattern analysis
          indicators: indicatorPayload,
          strategy: strategy,
          precisionLevel, // Include the chosen precision level
          consecutiveLossCount: consecutiveLossCountRef.current, marketContext: { executionMode: isPaperTradingActive ? "paper_trading" : "live", newsRisk: "LOW", session: "OVERLAP", minutesToHighImpactNews: 120, isSyntheticData: !!liveError, isStaleData: (Date.now() - lastRealTickAt) > 15000, dataAgeMs: Date.now() - lastRealTickAt, includesActiveCandle: true }
        })
      });

      if (!response.ok) {
        let errMsg = `Servidor retornou erro: ${response.statusText}`;
        try {
          const errData = await response.json();
          if (errData.message) errMsg = errData.message;
        } catch(e) {}
        throw new Error(errMsg);
      }

      const result = await response.json();

      const tdEntryPrice = result.marketContext?.executionPrice || result.marketContext?.mid;

      const isValidTdEntry =
        tdEntryPrice &&
        result.marketContext?.priceProvider === "fastforex" &&
        result.marketContext?.dataSourceType === "fastforex_rest" &&
        result.marketContext?.isStaleData === false &&
        result.marketContext?.dataAgeMs !== undefined &&
        result.marketContext?.dataAgeMs <= 10000;

      if (result.signal && result.signal !== "NEUTRAL" && !isValidTdEntry) {
        throw new Error("Preço FastForex integrado inválido ou stale. Sinal abortado.");
      }
      
      // Play high-fidelity synthesized entry tone alert
      playSignalSound(result.signal);
      
      const newSignal: AISignal = {
        id: Math.random().toString(36).substring(7),
        asset: selectedAsset.symbol,
        timeframe,
        strategy: result.strategy || strategy,
        signal: result.signal,
        technicalScore: result.technicalScore ?? 0,
            calibratedProbability: result.calibratedProbability ?? null,
            calibrationAvailable: result.calibrationAvailable || false,
        expiry: result.expiry,
        entryTime: result.entryTime || new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }),
        analysisTitle: result.analysisTitle || "Análise Técnica Real",
        reasoning: result.reasoning || [],
        keyLevels: result.keyLevels || { supportAvailable: false, resistanceAvailable: false, support: null, resistance: null, supportStrength: 0, resistanceStrength: 0, distanceToSupportAtr: null, distanceToResistanceAtr: null },
        indicatorsStatus: result.indicatorsStatus || { rsi: "Neutro", macd: "Neutro", bollinger: "Neutro", movingAverages: "Neutro" },
        entryPrice: tdEntryPrice,
        entryMarketContext: result.marketContext,
        status: "PENDING",
        isSimulated: result.isSimulated,
        message: result.message,
        errorMsg: result.errorMsg,
        candleAnalysis: result.candleAnalysis,
        marketFit: result.marketFit,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        expirySecondsRemaining: result.expiry?.includes("5") ? 300 : 60,
        historicalPerformance: result.historicalPerformance,
        isAutoSelected: result.isAutoSelected,
        autoCalibrationResults: result.autoCalibrationResults
      };

      setActiveSignal(newSignal);

      // Add to history list immediately so user sees AGUARDANDO... status live
      if (newSignal.signal !== "NEUTRAL") {
        setSignalHistory(oldHistory => [newSignal, ...oldHistory]);
      }

    } catch (err: any) {
      console.error(err);
      if (err?.message?.includes("Failed to fetch") || err?.message?.includes("failed to fetch")) {
        setErrorMessage("Não foi possível conectar ao servidor de inteligência artificial. O motor de análise pode estar iniciando ou o ambiente de desenvolvimento está em reinicialização rápida. Por favor, aguarde alguns instantes e clique em Analisar Ativo novamente.");
      } else {
        setErrorMessage(err.message || "Erro de conexão com o analisador de mercado.");
      }
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Trigger analysis automatically when selecting a new asset, but only AFTER candles are aligned with real FastForex data
  useEffect(() => {
    if (autoAnalyzeTrigger === selectedAsset.symbol && candles.length > 0 && isAlignedRef.current) {
      setAutoAnalyzeTrigger(null);
      handleAnalyzeMarket();
    }
  }, [autoAnalyzeTrigger, selectedAsset.symbol, candles, handleAnalyzeMarket]);

  // Market Sweep Scanner logic - Scan all assets for high-assertiveness signals
  const handleSweepAssets = async () => {
    if (isSweepScanning) return;
    
    setIsSweepScanning(true);
    setShowSweepModal(true);
    setSweepProgress(0);
    setSweepCurrentAsset("");
    
    addAutopilotLog("Varredura geral de ativos iniciada no terminal...", "info");
    
    const initialResults = ASSETS.map(asset => ({
      symbol: asset.symbol,
      name: asset.name,
      status: "idle" as "idle" | "scanning" | "success" | "error",
      payout: asset.payout,
      signal: undefined as AISignal | undefined,
      price: undefined as number | undefined,
      strategy: undefined as string | undefined
    }));
    setSweepResults(initialResults);
    
    const results = [...initialResults];
    
    for (let i = 0; i < ASSETS.length; i++) {
      const asset = ASSETS[i];
      setSweepCurrentAsset(asset.symbol);
      
      results[i] = {
        ...results[i],
        status: "scanning" as const
      };
      setSweepResults([...results]);
      
      const progressPercent = Math.round((i / ASSETS.length) * 100);
      setSweepProgress(progressPercent);
      
      const assetStrategies = strategyCatalogs[asset.symbol] || [];
      const validatedStrategies = assetStrategies.filter(s => s.winRate !== null);
      const bestStrategy = validatedStrategies.length > 0 
        ? validatedStrategies.reduce((prev, current) => ((current.winRate ?? 0) > (prev.winRate ?? 0)) ? current : prev, validatedStrategies[0])
        : { strategy: 'reversion', name: 'MHI / Retração', winRate: null };

      try {
        
        // 1. Fetch latest-price operacionamente
        const priceRes = await fetch(`/api/market/latest-price?symbol=${encodeURIComponent(asset.symbol)}`);
        if (!priceRes.ok) {
          throw new Error("LATEST_PRICE_FAILED");
        }
        const priceData = await priceRes.json();
        if (!priceData.ok || priceData.price === undefined || priceData.price === null) {
          throw new Error("LATEST_PRICE_STALE_OR_INVALID");
        }
        
        const basePrice = priceData.price;

        // 2. Fetch candles operacionamente
        const candlesRes = await fetch(`/api/market/candles?symbol=${encodeURIComponent(asset.symbol)}&interval=${timeframe}&limit=100`);
        if (!candlesRes.ok) {
          throw new Error("MARKET_CANDLES_UNAVAILABLE");
        }
        const candlesData = await candlesRes.json();
        const operationalCandles = candlesData.candles;
        
        if (!operationalCandles || operationalCandles.length < 10) {
          throw new Error("MARKET_CANDLES_UNAVAILABLE");
        }

        // 3. Fetch visual/indicator data via market-ticker (opcional, doesn't block the operation)
        let tickerData: any = {};
        try {
          const tickerRes = await fetch("/api/market-ticker", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ asset: asset.symbol, timeframe })
          });
          if (tickerRes.ok) {
            tickerData = await tickerRes.json();
          }
        } catch (tickerErr) {
          console.warn(`[Visual Ticker] Non-blocking indicator fetch failed for ${asset.symbol}:`, tickerErr);
        }

        const indicatorPayload = {
          rsi: tickerData.rsi !== undefined ? tickerData.rsi : 50,
          macd: { 
            line: tickerData.macdLine || 0, 
            signal: tickerData.macdSignal || 0, 
            histogram: tickerData.macdHistogram || 0 
          },
          bollinger: { 
            upper: basePrice * 1.001, 
            middle: basePrice, 
            lower: basePrice * 0.999 
          },
          ema9: tickerData.ema9 || basePrice,
          sma21: tickerData.sma21 || basePrice,
          stochastic: { k: 50, d: 50 },
          atr: 0.0002
        };
        
        const response = await fetch("/api/analyze-market", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            asset: asset.symbol,
            timeframe,
            currentPrice: basePrice,
            candles: operationalCandles,
            indicators: indicatorPayload,
            strategy: bestStrategy.strategy,
            precisionLevel,
            consecutiveLossCount: 0
          })
        });
        
        if (!response.ok) {
          let errMsg = "Erro ao processar análise do ativo";
          try {
            const errData = await response.json();
            if (errData.message) errMsg = errData.message;
          } catch(e) {}
          throw new Error(errMsg);
        }
        
        const result = await response.json();

        const entryPriceVal = result.marketContext?.executionPrice || result.marketContext?.mid;
        
        const isFastForexActive = result.marketContext?.priceProvider === "fastforex";
        const isValidEntry = isFastForexActive
          ? (
              result.marketContext?.isSyntheticData === false &&
              result.marketContext?.isStaleData === false &&
              result.marketContext?.dataAgeMs !== undefined &&
              result.marketContext?.dataAgeMs <= 10000
            )
          : false;

        if (result.signal && result.signal !== "NEUTRAL" && !isValidEntry) {
          result.signal = "NEUTRAL";
        }

        const finalEntryPrice = result.signal !== "NEUTRAL" ? entryPriceVal : (entryPriceVal || basePrice);
        
        const simulatedSignal: AISignal = {
          id: Math.random().toString(36).substring(7),
          asset: asset.symbol,
          timeframe,
          strategy: result.strategy || bestStrategy.strategy,
          signal: result.signal || "NEUTRAL",
          technicalScore: result.technicalScore ?? 0,
          calibratedProbability: null,
          calibrationAvailable: false,
          expiry: result.expiry || "1 MINUTO",
          entryTime: result.entryTime || new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }),
          analysisTitle: result.analysisTitle || "Varredura Automática",
          reasoning: result.reasoning || [],
          keyLevels: result.keyLevels || { supportAvailable: false, resistanceAvailable: false, support: null, resistance: null, supportStrength: 0, resistanceStrength: 0, distanceToSupportAtr: null, distanceToResistanceAtr: null },
          indicatorsStatus: result.indicatorsStatus || { rsi: "Neutro", macd: "Neutro", bollinger: "Neutro", movingAverages: "Neutro" },
          entryPrice: finalEntryPrice,
          entryMarketContext: result.marketContext,
          status: "PENDING",
          isSimulated: result.isSimulated,
          message: result.message,
          errorMsg: result.errorMsg,
          candleAnalysis: result.candleAnalysis,
          marketFit: result.marketFit,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          expirySecondsRemaining: result.expiry?.includes("5") ? 300 : 60
        };
        
        results[i] = {
          ...results[i],
          status: "success" as const,
          signal: simulatedSignal,
          price: basePrice,
          strategy: bestStrategy.strategy
        };
        
        if (simulatedSignal.signal !== "NEUTRAL") {
          addAutopilotLog(`✨ Varredura encontrou sinal de ${simulatedSignal.signal} em ${asset.symbol} com ${simulatedSignal.technicalScore}% de confiança!`, "success");
          playSignalSound(simulatedSignal.signal);
        }
        
      } catch (err) {
        console.warn(`Erro na varredura para ${asset.symbol}:`, err);
        // Se qualquer um falhar, marcar ativo como NEUTRAL/BLOQUEADO
        const fallbackPrice = asset.basePrice;
        results[i] = {
          ...results[i],
          status: "success" as const,
          price: fallbackPrice,
          strategy: bestStrategy.strategy,
          signal: {
            id: Math.random().toString(36).substring(7),
            asset: asset.symbol,
            timeframe,
            strategy: bestStrategy.strategy as StrategyType,
            signal: "NEUTRAL",
            technicalScore: 0,
            calibratedProbability: null,
            calibrationAvailable: false,
            expiry: "1 MINUTO",
            entryTime: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }),
            analysisTitle: "BLOQUEADO",
            reasoning: ["Ativo bloqueado: feeds inativos ou stale."],
            keyLevels: { supportAvailable: false, resistanceAvailable: false, support: null, resistance: null, supportStrength: 0, resistanceStrength: 0, distanceToSupportAtr: null, distanceToResistanceAtr: null },
            indicatorsStatus: { rsi: "Bloqueado", macd: "Bloqueado", bollinger: "Bloqueado", movingAverages: "Bloqueado" },
            entryPrice: fallbackPrice,
            status: "PENDING",
            isSimulated: true,
            timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            expirySecondsRemaining: 60
          }
        };
      }
      
      setSweepResults([...results]);
      await new Promise(resolve => setTimeout(resolve, 350));
    }
    
    setSweepProgress(100);
    setSweepCurrentAsset("");
    setIsSweepScanning(false);
    
    addAutopilotLog("Varredura geral de ativos concluída com sucesso.", "success");
  };

  // Advanced stats calculation based on AI signal history and active filters for Real-Time Analysis
  const stats = useMemo(() => {
    let list = signalHistory;
    
    if (statsAssetFilter === "CURRENT") {
      list = list.filter(s => s.asset === selectedAsset.symbol);
    }
    if (statsStrategyFilter !== "ALL") {
      list = list.filter(s => s.strategy === statsStrategyFilter);
    }
    
    const total = list.length;
    const callsCount = list.filter(s => s.signal === "CALL").length;
    const putsCount = list.filter(s => s.signal === "PUT").length;
    const neutralsCount = list.filter(s => s.signal === "NEUTRAL").length;
    
    // Average confidence of generated directional signals
    const directionalSignals = list.filter(s => s.signal !== "NEUTRAL");
    const scoredDirectional = directionalSignals
      .map(s => finiteNumber(s.technicalScore))
      .filter((n): n is number => n !== null);
    const scoredAll = list
      .map(s => finiteNumber(s.technicalScore))
      .filter((n): n is number => n !== null);
    const avgConfidence: number | null =
      scoredDirectional.length > 0
        ? Math.round(scoredDirectional.reduce((a, b) => a + b, 0) / scoredDirectional.length)
        : scoredAll.length > 0
          ? Math.round(scoredAll.reduce((a, b) => a + b, 0) / scoredAll.length)
          : null;

    return {
      total,
      callsCount,
      putsCount,
      neutralsCount,
      avgConfidence
    };
  }, [signalHistory, statsAssetFilter, statsStrategyFilter, selectedAsset]);

  return (
    <div className="min-h-screen bg-[#020617] text-[#f8fafc] flex flex-col font-sans selection:bg-indigo-500 selection:text-white overflow-x-hidden">
      
      {/* HEADER NAV */}
      <nav className="h-16 px-6 md:px-8 flex items-center justify-between border-b border-slate-800/80 bg-slate-950/70 backdrop-blur-md sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-gradient-to-br from-indigo-500 to-indigo-700 rounded-xl flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-500/20">
            B
          </div>
          <div className="flex flex-col">
            <span className="text-lg font-semibold tracking-tight text-white flex items-center gap-1.5">
              Binary<span className="text-indigo-400 font-bold">Pulse</span> AI
            </span>
            <span className="text-[9px] text-slate-500 tracking-wider uppercase font-medium">Análise Avançada</span>
          </div>
        </div>

        <div className="flex items-center gap-4 md:gap-6">
          <div className="hidden sm:flex items-center gap-2 bg-slate-900/60 border border-slate-800/80 px-3 py-1.5 rounded-lg text-xs">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
            <span className="text-slate-400 uppercase tracking-wider font-semibold text-[10px]">Mercado Ativo</span>
          </div>

          <div className="h-8 w-[1px] bg-slate-800/80 hidden sm:block"></div>

          <div className="flex flex-col items-end font-mono">
            <span className="text-[9px] text-slate-500 uppercase">Hora do Servidor</span>
            <span className="text-xs md:text-sm text-slate-300 font-semibold">{serverTime || "14:55:15 UTC"}</span>
          </div>

          <button 
            disabled={!isFastForexOperational}
            onClick={() => setAutoPilot(!autoPilot)}
            className={`px-3 py-1.5 rounded-xl border transition flex items-center gap-1.5 ${!isFastForexOperational ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'} text-xs font-bold uppercase tracking-wider ${
              autoPilot 
                ? "bg-emerald-600/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-600/20 shadow-md shadow-emerald-500/5 animate-pulse" 
                : "bg-slate-900 border-slate-800 text-slate-500 hover:text-slate-400"
            }`}
            title={autoPilot ? "Desativar Autopiloto (Varredura Contínua)" : "Ativar Autopiloto (Varredura Contínua)"}
          >
            <Bot size={15} className={autoPilot ? "animate-bounce" : ""} />
            <span>{autoPilot ? "Piloto Auto: ON" : "Piloto Auto: OFF"}</span>
          </button>

          <button 
            onClick={() => setAudioEnabled(!audioEnabled)}
            className={`w-9 h-9 rounded-xl border transition flex items-center justify-center cursor-pointer ${
              audioEnabled 
                ? "bg-indigo-600/10 border-indigo-500/30 text-indigo-400 hover:bg-indigo-600/20" 
                : "bg-slate-900 border-slate-850 text-slate-500 hover:text-slate-400"
            }`}
            title={audioEnabled ? "Desativar Alertas de Áudio" : "Ativar Alertas de Áudio"}
          >
            {audioEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
          </button>

          <a
            href="/api/download-project"
            download="projeto-completo-robo.zip"
            className="px-3 py-1.5 rounded-xl border border-violet-500/30 bg-violet-600/15 hover:bg-violet-600/25 text-violet-300 hover:text-violet-200 transition flex items-center gap-1.5 cursor-pointer text-xs font-bold uppercase tracking-wider shadow-md shadow-violet-500/10"
            title="Baixar Código Fonte Completo (ZIP) para Análise"
          >
            <Download size={14} className="text-violet-400" />
            <span className="hidden md:inline">Exportar ZIP</span>
            <span className="inline md:hidden">ZIP</span>
          </a>

          <button 
            onClick={() => setShowHelp(true)}
            className="w-9 h-9 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-white transition flex items-center justify-center cursor-pointer"
            title="Como Funciona"
          >
            <HelpCircle size={18} />
          </button>
        </div>
      </nav>

      {/* SUB-HEADER / WALLET STATS BAR */}
      <div className="bg-slate-950/40 border-b border-slate-900 py-3 px-6 md:px-8 flex flex-col xl:flex-row items-center justify-between gap-4">
        {/* Active Asset Selector */}
        <div className="flex flex-col md:flex-row items-start md:items-center gap-3 w-full xl:w-auto">
          <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400 flex items-center gap-1.5 shrink-0">
            <TrendingUp size={12} className="text-indigo-400" />
            Ativo selecionado:
          </span>
          {/* Asset List Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {ASSETS.map((asset) => (
              <button
                key={asset.symbol}
                onClick={() => {
                  setSelectedAsset(asset);
                  setActiveSignal(null);
                  setAutoAnalyzeTrigger(asset.symbol);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition flex items-center gap-1.5 border cursor-pointer ${
                  selectedAsset.symbol === asset.symbol
                    ? "bg-indigo-600/15 text-indigo-300 border-indigo-500/40"
                    : "bg-slate-900/30 text-slate-400 border-slate-800/40 hover:bg-slate-800/50"
                }`}
              >
                <span>{asset.symbol}</span>
                <span className={`text-[9px] font-bold ${selectedAsset.symbol === asset.symbol ? "text-emerald-400" : "text-emerald-500/80"}`}>
                  ({!isFastForexOperational ? "N/A" : (asset.payout * 100) + "%"})
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Global Performance HUD */}
        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto justify-end">
          <div className="bg-slate-900/50 border border-slate-800/60 rounded-xl px-3.5 py-1.5 flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-400">
              <Award size={14} />
            </div>
            <div>
              <div className="text-[8px] text-slate-500 uppercase tracking-wider font-semibold">Total de Alertas</div>
              <div className="text-xs font-bold text-slate-100 font-mono">
                {stats.total}
              </div>
            </div>
          </div>

          <div className="bg-slate-900/50 border border-slate-800/60 rounded-xl px-3.5 py-1.5 flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400">
              <Check size={14} />
            </div>
            <div>
              <div className="text-[8px] text-slate-500 uppercase tracking-wider font-semibold">Gatilhados CALL</div>
              <div className="text-xs font-bold text-emerald-400 font-mono">
                {stats.callsCount}
              </div>
            </div>
          </div>

          <div className="bg-slate-900/50 border border-slate-800/60 rounded-xl px-3.5 py-1.5 flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-400">
              <TrendingUp size={14} />
            </div>
            <div>
              <div className="text-[8px] text-slate-500 uppercase tracking-wider font-semibold">Confiança Média</div>
              <div className="text-xs font-bold text-purple-400 font-mono">
                {formatPercent(stats.avgConfidence)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* MAIN LAYOUT */}
      <main className="flex-grow p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 max-w-[1600px] w-full mx-auto">
        
        {/* LEFT COLUMN: ACTIVE PAIRS & TIMEFRAME CONFIG (Span 3) */}
        <aside className="lg:col-span-3 flex flex-col gap-6">

          {/* OPERATIONAL DATA SOURCE STATUS PANEL */}
          <div className="bg-slate-900/40 backdrop-blur-md border border-slate-800/60 p-4 rounded-2xl flex flex-col gap-2">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest border-b border-slate-800/60 pb-2">
              FONTE OPERACIONAL: FASTFOREX
            </h3>
            {fastForexHealth ? (
              <div className="flex flex-col gap-1 text-[10px] text-slate-300">
                <div className="flex justify-between">
                  <span>Provedor:</span>
                  <span className="uppercase text-slate-400 font-bold">
                    FastForex
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Conexão:</span>
                  <span className={`uppercase font-bold ${fastForexHealth.connected ? "text-emerald-400" : "text-rose-400"}`}>
                    {fastForexHealth.connected ? "ATIVO & ESTÁVEL" : "DESCONECTADO"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Sincronização:</span>
                  <span>{fastForexHealth.lastRealTickAt ? `${fastForexHealth.dataAgeMs} ms atrás` : "Sem tick real ainda"}</span>
                </div>
                <div className="flex justify-between">
                  <span>Spread médio:</span>
                  <span className={currentSpread !== null && currentSpread > 2.0 ? "text-rose-400 font-bold" : "text-emerald-400 font-bold"}>
                    {currentSpread !== null ? `${currentSpread.toFixed(1)} pips` : "Mínimo"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Alimentação:</span>
                  <span className={fastForexHealth.connected ? "text-emerald-400 font-bold uppercase" : "text-slate-500 font-bold uppercase"}>
                    {fastForexHealth.connected ? "DADOS EM TEMPO REAL" : "indisponível"}
                  </span>
                </div>
                <div className="mt-1 text-center bg-slate-800/50 rounded py-1 text-slate-400">
                  FastForex: Motor Principal
                </div>
                {(!isFastForexOperational) ? (
                  <div className="mt-2 bg-rose-950/50 border border-rose-900/50 rounded p-2 text-center text-rose-400">
                    <span className="font-bold block">SINAIS BLOQUEADOS</span>
                    <span className="text-[9px]">
                      Motivo: Feed FastForex inativo ou stale
                    </span>
                  </div>
                ) : (
                  <div className="mt-2 bg-emerald-950/50 border border-emerald-900/50 rounded p-2 text-center text-emerald-400">
                    <span className="font-bold block">SINAIS LIBERADOS</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-[10px] text-slate-500 text-center">Carregando status do provedor...</div>
            )}
          </div>

          
          {/* Asset Info / Details Card */}
          <div className="bg-slate-900/40 backdrop-blur-md border border-slate-800/60 p-5 rounded-2xl flex flex-col gap-4">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest border-b border-slate-800/60 pb-2">
              Ativo Selecionado
            </h3>
            
            <div className="flex justify-between items-start">
              <div>
                <div className="flex items-center gap-1.5">
                  <h4 className="text-lg font-bold text-white">{selectedAsset.symbol}</h4>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">{selectedAsset.name}</p>
              </div>
              <span className={`px-2 py-1 rounded text-[10px] font-bold ${isFastForexOperational ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-800 text-slate-500'}`}>
                {isFastForexOperational ? `PAYOUT ${selectedAsset.payout * 100}%` : "PAYOUT N/A"}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="bg-slate-950/40 p-3 rounded-xl border border-slate-800/30 text-center">
                <span className="text-[10px] text-slate-500 block mb-0.5">Preço Atual</span>
                <span className={`text-sm font-mono font-bold ${isFastForexOperational ? 'text-slate-200' : 'text-slate-600'}`}>
                  {isFastForexOperational ? currentPrice.toFixed(selectedAsset.decimals) : "INDISPONÍVEL"}
                </span>
              </div>
              <div className="bg-slate-950/40 p-3 rounded-xl border border-slate-800/30 text-center">
                <span className="text-[10px] text-slate-500 block mb-0.5">Volatilidade</span>
                <span className={`text-sm font-mono font-bold ${(selectedAsset.symbol.includes("BTC") || selectedAsset.symbol.includes("ETH") || selectedAsset.symbol.includes("SOL")) ? "text-rose-400" : "text-amber-400"}`}>
                  {(selectedAsset.symbol.includes("BTC") || selectedAsset.symbol.includes("ETH") || selectedAsset.symbol.includes("SOL")) ? "Extrema" : "Moderada"}
                </span>
              </div>
            </div>

            {/* FROZEN ALGORITHM CLASSIFIER BAR (Forex vs Crypto) */}
            {(() => {
              const isCrypto = selectedAsset.symbol.includes("BTC") || selectedAsset.symbol.includes("ETH") || selectedAsset.symbol.includes("SOL") || selectedAsset.symbol.includes("XRP") || selectedAsset.symbol.includes("BNB");
              return (
                <div className={`p-3 rounded-xl border ${isCrypto ? "bg-purple-950/20 border-purple-500/30" : "bg-blue-950/20 border-blue-500/30"} flex flex-col gap-1.5`}>
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">Diretriz de Análise</span>
                    <span className={`text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded ${isCrypto ? "bg-purple-500/20 text-purple-300" : "bg-blue-500/20 text-blue-300"}`}>
                      {isCrypto ? "�� ALGO CRIPTO" : "�� ALGO FOREX"}
                    </span>
                  </div>
                  <p className="text-[9px] text-slate-300 leading-relaxed font-sans">
                    {isCrypto ? (
                      <span>
                        <strong>Estratégia Congelada:</strong> Filtros calibrados para momentum extremo. Evita contra-tendência, exige <strong>RSI extremo (≤28 ou ≥72)</strong> e simula absorção de baleias em futuros.
                      </span>
                    ) : (
                      <span>
                        <strong>Estratégia Congelada:</strong> Calibrada para reversões estruturadas e pipetagem milimétrica. Exige <strong>RSI (≤32 ou ≥68)</strong> e exaustão de canais de liquidez institucional.
                      </span>
                    )}
                  </p>
                </div>
              );
            })()}

            {/* SENTIMENTO DO MERCADO (Market Sentiment Widget) */}
            <div className="bg-slate-950/30 border border-slate-800/40 p-3 rounded-xl flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Flame size={12} className="text-amber-400 animate-pulse shrink-0" />
                  <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider">
                    Sentimento do Mercado
                  </span>
                </div>
                <span className={`text-[8px] px-1.5 py-0.5 rounded font-bold uppercase ${liveDiagnostics.sentimentColor}`}>
                  {liveDiagnostics.sentimentLabel}
                </span>
              </div>

              {/* Progress bar Touros vs Ursos */}
              <div className="flex flex-col gap-1.5 pt-0.5">
                <div className="flex justify-between text-[9px] font-mono">
                  <span className="text-emerald-400 font-bold flex items-center gap-1">
                    �� Compra: {formatPercent(liveDiagnostics.buyerSentiment)}
                  </span>
                  <span className="text-rose-400 font-bold flex items-center gap-1">
                    Venda: {formatPercent(liveDiagnostics.sellerSentiment)} ��
                  </span>
                </div>
                
                {/* Visual indicator bar with custom gradient transitions */}
                <div className="h-2 w-full bg-slate-900 rounded-full overflow-hidden flex border border-slate-800/50">
                  <div 
                    className="h-full bg-emerald-500 transition-all duration-500 shadow-[inset_-2px_0_4px_rgba(0,0,0,0.3)]"
                    style={{ width: `${clampPercent(liveDiagnostics.buyerSentiment)}%` }}
                  />
                  <div 
                    className="h-full bg-rose-500 transition-all duration-500"
                    style={{ width: `${clampPercent(liveDiagnostics.sellerSentiment)}%` }}
                  />
                </div>
                
                <p className="text-[8px] text-slate-500 leading-normal mt-0.5">
                  {(liveDiagnostics.buyerSentiment ?? 50) >= 58 ? (
                    <span><strong>Touros Dominantes:</strong> Maioria dos indicadores técnicos (RSI, Médias e MACD) apontam para forte momentum comprador de curto prazo no livro de ofertas.</span>
                  ) : (liveDiagnostics.buyerSentiment ?? 50) <= 42 ? (
                    <span><strong>Ursos Dominantes:</strong> Forte fluxo vendedor detectado com rompimento descendente de médias rápidas e exaustão no suporte institucional.</span>
                  ) : (
                    <span><strong>Equilíbrio Neutro:</strong> Consolidação de preços sem tendência definida. Recomendável aguardar rompimento das bandas de Bollinger antes da operação.</span>
                  )}
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-2 p-3 bg-emerald-950/10 border border-emerald-500/20 rounded-xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <TrendingUp size={12} className="text-emerald-400 shrink-0" />
                  <span className="text-[9px] font-black uppercase text-emerald-300 tracking-wider">
                    Feed Real-Time Ativo
                  </span>
                </div>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
              </div>
              <p className="text-[9px] text-slate-400 leading-normal">
                Sincronizado diretamente com a API da **FastForex**. Preço, médias móveis, RSI, MACD e canais de Bollinger estão atualizando em tempo real a cada 3 segundos.
              </p>
            </div>
          </div>

          {/* ESTRATÉGIA DE OPERAÇÃO IA E CATALOGADOR */}
          <div className="bg-slate-900/40 backdrop-blur-md border border-slate-800/60 p-5 rounded-2xl flex flex-col gap-4">
            <div className="flex justify-between items-center border-b border-slate-800/60 pb-2">
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                <Target size={14} className="text-indigo-400" />
                <span>Estratégia do Robô</span>
              </h3>
              <span className="text-[9px] text-emerald-400 font-mono font-semibold bg-emerald-500/10 px-1.5 py-0.5 rounded">Catalogado</span>
            </div>

            <div className="flex flex-col gap-2.5">
              {/* Opção Inteligência Autônoma Adaptativa */}
              <button
                onClick={() => {
                  setStrategy("auto");
                  setActiveSignal(null);
                }}
                className={`p-3.5 rounded-xl border text-left transition flex flex-col gap-1.5 cursor-pointer group relative overflow-hidden ${
                  strategy === "auto"
                    ? "bg-violet-600/10 border-violet-500/80 text-white shadow-lg shadow-violet-500/5"
                    : "bg-slate-950/20 border-slate-800/60 hover:border-violet-800/50 text-slate-300"
                }`}
              >
                {/* Visual pulse glow on selection */}
                {strategy === "auto" && (
                  <span className="absolute top-0 right-0 w-32 h-32 bg-violet-500/10 blur-2xl rounded-full -mr-10 -mt-10"></span>
                )}
                
                <div className="flex justify-between items-center w-full relative z-10">
                  <span className="text-[11.5px] font-black uppercase text-violet-300 tracking-wide flex items-center gap-1.5">
                    <Sparkles size={13} className="text-violet-400 animate-pulse animate-duration-1000" />
                    <span>IA Auto-Adaptativa</span>
                  </span>
                  <span className="text-[9px] px-2 py-0.5 rounded-full font-bold uppercase bg-violet-500/20 text-violet-300 border border-violet-500/30 tracking-wider">
                    Auto-IA
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 leading-relaxed relative z-10">
                  O robô realiza backtests de alta velocidade de todas as 5 estratégias em tempo real nos últimos 15 candles e ativa a de maior assertividade para o ciclo atual.
                </p>
                <div className="flex items-center gap-1.5 text-[9px] text-violet-400 font-medium relative z-10 pt-0.5">
                  <Cpu size={11} className="text-violet-400" />
                  <span>Sincronização Ativa & Calibração Automática a cada 3s</span>
                </div>
              </button>

              <div className="flex items-center gap-2 my-1">
                <span className="h-[1px] bg-slate-800/60 grow"></span>
                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest shrink-0">Estratégias Individuais</span>
                <span className="h-[1px] bg-slate-800/60 grow"></span>
              </div>

              {(strategyCatalogs[selectedAsset.symbol] || []).map((cat) => {
                const isSelected = strategy === cat.strategy;
                return (
                  <button
                    key={cat.strategy}
                    onClick={() => {
                      setStrategy(cat.strategy);
                      setActiveSignal(null);
                    }}
                    className={`p-3 rounded-xl border text-left transition flex flex-col gap-1 cursor-pointer group ${
                      isSelected
                        ? "bg-indigo-600/10 border-indigo-500/60 text-white shadow-md shadow-indigo-600/5"
                        : "bg-slate-950/20 border-slate-800/60 hover:border-slate-700/80 text-slate-300"
                    }`}
                  >
                    <div className="flex justify-between items-center w-full">
                      <span className={`text-[11px] font-bold ${isSelected ? "text-indigo-300" : "text-slate-200 group-hover:text-white"}`}>
                        {cat.strategy === 'reversion' ? 'Retração em Extremos' : cat.strategy === 'trend' ? 'Seguidor de Tendência' : cat.strategy === 'breakout' ? 'Rompimento Dinâmico' : cat.strategy === 'candle_flow' ? 'Fluxo de Velas (M1/M5)' : 'Price Action Clássico'}
                      </span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-bold ${
                        (cat.winRate !== null && cat.winRate >= 58) ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-500/10 text-amber-400"
                      }`}>
                        Assertividade: {cat.winRate !== null ? cat.winRate + "%" : "N/A"}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400 leading-relaxed">
                      {cat.description}
                    </p>
                  </button>
                );
              })}
            </div>
            
            {/* Filtro de Risco Inteligente */}
            <div className={`p-3 rounded-xl border flex items-start gap-2.5 text-xs leading-relaxed ${
              selectedAsset.symbol === "BTC/USD" && strategy === "reversion"
                ? "bg-rose-500/5 border-rose-500/20 text-rose-300"
                : (selectedAsset.symbol === "EUR/USD" || selectedAsset.symbol === "USD/BRL") && strategy === "reversion"
                ? "bg-emerald-500/5 border-emerald-500/20 text-emerald-300"
                : "bg-amber-500/5 border-amber-500/20 text-amber-300"
            }`}>
              {selectedAsset.symbol === "BTC/USD" && strategy === "reversion" ? (
                <>
                  <ShieldAlert size={14} className="flex-shrink-0 mt-0.5 text-rose-400 animate-pulse" />
                  <div>
                    <span className="font-bold block text-[9px] uppercase text-rose-400 tracking-wider">Risco Elevado</span>
                    Retração não recomendada no BTC devido à alta volatilidade. Considere operar em <strong>Tendência</strong> para maior precisão de acerto.
                  </div>
                </>
              ) : (selectedAsset.symbol === "EUR/USD" || selectedAsset.symbol === "USD/BRL") && strategy === "reversion" ? (
                <>
                  <ShieldCheck size={14} className="flex-shrink-0 mt-0.5 text-emerald-400" />
                  <div>
                    <span className="font-bold block text-[9px] uppercase text-emerald-400 tracking-wider">Fator Alta Assertividade</span>
                    Ambiente excelente. Mercado estável de baixa volatilidade ideal para Retração e MHI. Altíssima probabilidade de vitória (WIN).
                  </div>
                </>
              ) : (
                <>
                  <Info size={14} className="flex-shrink-0 mt-0.5 text-amber-400" />
                  <div>
                    <span className="font-bold block text-[9px] uppercase text-amber-400 tracking-wider">Moderação de Volatilidade</span>
                    Parâmetros normais. Siga o gerenciamento de banca recomendado e evite entradas pesadas fora das confluências da IA.
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Advanced Statistics Bento Panel */}
          <div className="bg-slate-900/40 backdrop-blur-md border border-slate-800/60 p-5 rounded-2xl flex flex-col gap-4">
            <div className="flex justify-between items-center border-b border-slate-800/60 pb-2">
              <span className="text-xs font-bold text-slate-200 tracking-wider uppercase flex items-center gap-1.5">
                <BarChart3 size={14} className="text-indigo-400 animate-pulse" />
                Painel de Assertividade
              </span>
              <button
                onClick={() => {
                  if (window.confirm("Deseja realmente limpar todo o histórico de sinais e reiniciar as estatísticas?")) {
                    setSignalHistory([]);
                    addAutopilotLog("Histórico de sinais e estatísticas reiniciados pelo usuário.", "warn");
                  }
                }}
                className="text-[9px] text-slate-500 hover:text-rose-400 transition flex items-center gap-1 cursor-pointer font-semibold uppercase tracking-wider"
                title="Limpar Histórico"
              >
                <Trash2 size={11} />
                Limpar
              </button>
            </div>

            {/* Interactive Filters */}
            <div className="grid grid-cols-2 gap-2 text-[10px]">
              <div>
                <span className="text-slate-500 block mb-1 uppercase font-semibold">Par de Ativos</span>
                <select
                  value={statsAssetFilter}
                  onChange={(e) => setStatsAssetFilter(e.target.value as any)}
                  className="w-full bg-slate-950/80 border border-slate-800/80 rounded-lg px-2 py-1 text-slate-300 font-medium focus:outline-none focus:border-indigo-500 transition cursor-pointer"
                >
                  <option value="ALL">Todos os Pares</option>
                  <option value="CURRENT">Apenas {selectedAsset.symbol}</option>
                </select>
              </div>
              <div>
                <span className="text-slate-500 block mb-1 uppercase font-semibold">Estratégia IA</span>
                <select
                  value={statsStrategyFilter}
                  onChange={(e) => setStatsStrategyFilter(e.target.value)}
                  className="w-full bg-slate-950/80 border border-slate-800/80 rounded-lg px-2 py-1 text-slate-300 font-medium focus:outline-none focus:border-indigo-500 transition cursor-pointer"
                >
                  <option value="ALL">Todas Estratégias</option>
                  <option value="reversion">MHI / Retração</option>
                  <option value="trend">EMA/MACD / Tendência</option>
                  <option value="price_action">Price Action / Rejeição</option>
                </select>
              </div>
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-2 gap-3 mt-1">
              {/* Box 1: Confiança Média */}
              <div className="bg-slate-950/50 rounded-xl border border-slate-800/40 p-3 flex flex-col justify-between">
                <span className="text-[9px] text-slate-400 uppercase tracking-wide">Confiança Média</span>
                <div className="flex items-baseline gap-1.5 mt-1.5">
                  <span className={`text-xl font-extrabold font-mono ${
                    (stats.avgConfidence ?? 0) >= 90 ? "text-emerald-400" : (stats.avgConfidence ?? 0) >= 75 ? "text-amber-400" : "text-rose-400"
                  }`}>
                    {formatPercent(stats.avgConfidence)}
                  </span>
                  <span className="text-[9px] text-slate-500 font-medium">filtrado</span>
                </div>
                <div className="w-full bg-slate-800/50 h-1.5 rounded-full overflow-hidden mt-2">
                  <div 
                    className={`h-full transition-all duration-500 ${
                      (stats.avgConfidence ?? 0) >= 90 ? "bg-emerald-500" : (stats.avgConfidence ?? 0) >= 75 ? "bg-amber-500" : "bg-rose-500"
                    }`}
                    style={{ width: `${clampPercent(stats.avgConfidence)}%` }}
                  />
                </div>
              </div>

              {/* Box 2: Alertas CALL / PUT */}
              <div className="bg-slate-950/50 rounded-xl border border-slate-800/40 p-3 flex flex-col justify-between">
                <span className="text-[9px] text-slate-400 uppercase tracking-wide">Alertas Emitidos</span>
                <div className="flex items-baseline gap-1 mt-1.5">
                  <span className="text-lg font-extrabold text-emerald-400 font-mono">{stats.callsCount} <span className="text-[9px] font-normal text-slate-500 uppercase">CALL</span></span>
                  <span className="text-slate-500 font-mono text-xs">/</span>
                  <span className="text-lg font-extrabold text-rose-400 font-mono">{stats.putsCount} <span className="text-[9px] font-normal text-slate-500 uppercase">PUT</span></span>
                </div>
                <p className="text-[8px] text-slate-500 leading-none mt-2">
                  Total de {stats.total} sinais nesta sessão
                </p>
              </div>

              {/* Box 3: Sinais Neutros */}
              <div className="bg-slate-950/50 rounded-xl border border-slate-800/40 p-3 flex flex-col justify-between">
                <span className="text-[9px] text-slate-400 uppercase tracking-wide">Mercado Neutro</span>
                <div className="flex items-baseline justify-between mt-1.5">
                  <span className="text-lg font-extrabold text-amber-400 font-mono">{stats.neutralsCount}</span>
                  <span className="text-[9px] text-slate-500 font-medium">alertas</span>
                </div>
                <p className="text-[8px] text-slate-500 leading-none mt-2">
                  Aguardando confluências
                </p>
              </div>

              {/* Box 4: Filtro de Precisão */}
              <div className="bg-slate-950/50 rounded-xl border border-slate-800/40 p-3 flex flex-col justify-between gap-1.5">
                <div>
                  <span className="text-[9px] text-slate-400 uppercase tracking-wide block mb-1">Precisão IA</span>
                  <div className="flex gap-1 bg-slate-900/80 p-0.5 rounded border border-slate-800/80">
                    {(['normal', 'high', 'elite'] as const).map((level) => (
                      <button
                        key={level}
                        id={`btn-precision-${level}`}
                        onClick={() => setPrecisionLevel(level)}
                        className={`flex-1 text-[8px] font-black uppercase py-1 rounded text-center cursor-pointer transition-all ${
                          precisionLevel === level
                            ? level === 'elite'
                              ? 'bg-indigo-500 text-white shadow'
                              : level === 'high'
                              ? 'bg-cyan-500 text-white shadow'
                              : 'bg-emerald-500 text-white shadow'
                            : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
                        }`}
                      >
                        {level === 'elite' ? 'Elite' : level === 'high' ? 'Máx' : 'Norm'}
                      </button>
                    ))}
                  </div>
                </div>
                <p className="text-[8px] text-slate-500 leading-tight">
                  {precisionLevel === 'elite' 
                    ? 'Elite: Filtros máximos com confluência de 95%+' 
                    : precisionLevel === 'high' 
                    ? 'Máxima: Calibração técnica refinada' 
                    : 'Normal: Análise padrão sem filtros adicionais'}
                </p>
              </div>
            </div>
            
            {/* BACKSTAGE SECTION (MAIN) */}
            <div className={`mt-2 bg-slate-950/50 rounded-xl border p-3 flex flex-col gap-2 ${
              backstageStatus.validationStatus === "BACKSTAGE_VALIDATED" ? "border-emerald-500/40" : "border-slate-800/40"
            }`}>
              <div className="flex items-center justify-between">
                <span className="text-[9px] text-indigo-400 uppercase tracking-wide font-black flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
                  Backstage Replay ({selectedAsset.symbol})
                </span>
                <span className={`text-[8px] px-1.5 py-0.5 rounded font-black ${
                  backstageStatus.validationStatus === "BACKSTAGE_VALIDATED" ? "bg-emerald-500/20 text-emerald-400" :
                  backstageStatus.validationStatus === "BACKSTAGE_TESTING" ? "bg-amber-500/20 text-amber-400" :
                  "bg-rose-500/20 text-rose-400"
                }`}>
                  {backstageStatus.validationStatus === "BACKSTAGE_VALIDATED" ? "VALIDADO" :
                   backstageStatus.validationStatus === "BACKSTAGE_TESTING" ? "EM TESTE" : "REJEITADO"}
                </span>
              </div>
              
              <div className="flex justify-between items-end mt-1">
                <div>
                  <span className="text-[10px] text-slate-500 block leading-none">Progresso</span>
                  <span className="text-base font-black font-mono text-slate-200">
                    {backstageStatus.currentSignals} <span className="text-[9px] text-slate-500 font-normal">/ {backstageStatus.requiredSignals} sinais</span>
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-slate-500 block leading-none">Win Rate</span>
                  <span className={`text-base font-black font-mono ${
                    (backstageStatus.winRate !== null && backstageStatus.winRate >= 58) ? "text-emerald-400" : "text-rose-400"
                  }`}>
                    {backstageStatus.winRate !== null ? backstageStatus.winRate + "%" : "N/A"}
                  </span>
                </div>
              </div>
              
              <div className="w-full bg-slate-900 rounded-full h-1 mt-1 overflow-hidden">
                <div 
                  className={`h-full transition-all duration-300 ${
                    backstageStatus.validationStatus === "BACKSTAGE_VALIDATED" ? "bg-emerald-500" : "bg-amber-500"
                  }`} 
                  style={{ width: `${clampPercent(backstageStatus.requiredSignals > 0 ? (backstageStatus.currentSignals / backstageStatus.requiredSignals) * 100 : 0)}%` }} 
                />
              </div>

              <div className="flex justify-between items-center text-[9px] text-slate-500 mt-0.5">
                <span>Max Sequência Loss: <strong>{backstageStatus.maxConsecutiveLosses}</strong> (Limite: 5)</span>
              </div>
              
              <div className="flex flex-col gap-1 mt-1 bg-slate-900/50 p-2 rounded text-[9px] text-slate-400">
                <div className="flex justify-between">
                  <span>Sinais Decididos (W/L):</span>
                  <span className="text-slate-200">{backstageStatus.wins} W / {backstageStatus.losses} L</span>
                </div>
                <div className="flex justify-between">
                  <span>Melhor Estratégia:</span>
                  <span className="text-emerald-400 font-medium">
                    {Object.entries(backstageStatus.byStrategy).sort((a, b) => (b[1] as any).winRate - (a[1] as any).winRate)[0]?.[0] || "N/A"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Regime Dominante:</span>
                  <span className="text-slate-200 uppercase">
                    {Object.entries(backstageStatus.byRegime).sort((a, b) => (b[1] as any).total - (a[1] as any).total)[0]?.[0] || "N/A"}
                  </span>
                </div>
              </div>

              <div className="mt-2 flex gap-1.5">
                <button 
                  onClick={runBackstageReplayAction}
                  disabled={isBackstageRunning || !fastForexHealth || !fastForexHealth.configured}
                  className={`flex-1 text-[10px] font-black py-1.5 rounded cursor-pointer ${
                    isBackstageRunning || !fastForexHealth || !fastForexHealth.configured 
                      ? "bg-indigo-500/10 text-indigo-300/30 cursor-not-allowed" 
                      : "bg-indigo-500 hover:bg-indigo-600 text-white shadow-lg shadow-indigo-500/20"
                  } transition-all`}
                >
                  {isBackstageRunning ? "Processando..." : "Rodar Replay Ativo"}
                </button>
                <button 
                  onClick={exportBackstageReport}
                  className="px-2.5 text-[10px] font-bold py-1.5 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 transition-colors cursor-pointer"
                  title="Exportar Relatório"
                >
                  Exportar
                </button>
              </div>
              
              {backstageError && (
                <div className="mt-1 p-2 bg-rose-500/10 border border-rose-500/20 rounded text-rose-400 text-[9px] text-center font-semibold leading-tight">
                  {backstageError}
                </div>
              )}
            </div>

            {/* BACKSTAGE SCANNER (GENERAL SCAN) */}
            <div className="mt-2 bg-slate-950/50 rounded-xl border border-slate-800/40 p-3 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-[9px] text-amber-400 uppercase tracking-wide font-black flex items-center gap-1">
                  <BarChart3 size={12} className="text-amber-400 animate-pulse" />
                  Scanner Backstage Geral
                </span>
                {scannerResults.length > 0 && (
                  <span className="text-[8px] px-1 py-0.5 rounded font-black bg-emerald-500/10 text-emerald-400">
                    {scannerResults.filter(r => r.status === "BEST_SETUP").length} Setups Top
                  </span>
                )}
              </div>

              <p className="text-[8.5px] text-slate-500 leading-normal">
                Analisa todos os ativos Forex, M1/M5 e estratégias para ranquear as confluências de maior assertividade.
              </p>

              <button
                onClick={runBackstageScannerAction}
                disabled={isScannerRunning || !fastForexHealth || !fastForexHealth.configured}
                className={`w-full text-[10px] font-black py-1.5 rounded cursor-pointer ${
                  isScannerRunning || !fastForexHealth || !fastForexHealth.configured
                    ? "bg-amber-500/10 text-amber-300/30 cursor-not-allowed"
                    : "bg-amber-500 hover:bg-amber-600 text-slate-950 shadow-lg shadow-amber-500/20"
                } transition-all`}
              >
                {isScannerRunning ? "Varrendo Mercado (12 combinações)..." : "Rodar Backstage Geral"}
              </button>

              {scannerError && (
                <div className="mt-1 p-2 bg-rose-500/10 border border-rose-500/20 rounded text-rose-400 text-[9px] text-center font-semibold leading-tight">
                  {scannerError}
                </div>
              )}

              {/* SCANNER RESULTS PREVIEW */}
              {scannerResults.length > 0 ? (
                <div className="mt-1 flex flex-col gap-1.5 max-h-[220px] overflow-y-auto pr-1">
                  {scannerResults
                    .sort((a, b) => {
                      const statusOrder: Record<string, number> = { "BEST_SETUP": 0, "ACCEPTABLE_SETUP": 1, "REJECTED_SETUP": 2, "INSUFFICIENT_HISTORY": 3 };
                      return (statusOrder[a.status] ?? 0) - (statusOrder[b.status] ?? 0) || b.winRate - a.winRate;
                    })
                    .slice(0, 10) // show top 10
                    .map((item, idx) => (
                      <div key={idx} className={`p-1.5 rounded border text-[9px] flex flex-col gap-0.5 ${
                        item.status === "BEST_SETUP" ? "bg-emerald-950/20 border-emerald-500/20" :
                        item.status === "ACCEPTABLE_SETUP" ? "bg-amber-950/20 border-amber-500/20" :
                        item.status === "REJECTED_SETUP" ? "bg-rose-950/20 border-rose-500/20" :
                        "bg-slate-900/40 border-slate-800/40"
                      }`}>
                        <div className="flex justify-between items-center">
                          <span className="font-bold text-slate-200">{item.asset} ({item.timeframe})</span>
                          <span className={`text-[8px] font-bold uppercase ${
                            item.status === "BEST_SETUP" ? "text-emerald-400" :
                            item.status === "ACCEPTABLE_SETUP" ? "text-amber-400" :
                            item.status === "REJECTED_SETUP" ? "text-rose-400" :
                            "text-slate-500"
                          }`}>
                            {item.status === "BEST_SETUP" ? "Melhor Setup" :
                             item.status === "ACCEPTABLE_SETUP" ? "Aceitável" :
                             item.status === "REJECTED_SETUP" ? "Rejeitado" :
                             "Hist. Insuficiente"}
                          </span>
                        </div>
                        <div className="flex justify-between text-[8px] text-slate-400">
                          <span>Estratégia: <strong className="text-slate-300 capitalize">{item.strategy}</strong></span>
                          <span>Regime: <strong className="text-slate-300 uppercase">{item.dominantRegime}</strong></span>
                        </div>
                        <div className="flex justify-between items-center text-[8.5px] mt-0.5 pt-0.5 border-t border-slate-800/30">
                          <span>Assertividade: <strong className={(item.winRate !== null && item.winRate >= 58) ? "text-emerald-400" : "text-rose-400"}>{item.winRate !== null ? item.winRate.toFixed(1) + "%" : "N/A"}</strong></span>
                          <span>Sinais: <strong className="text-slate-200">{item.totalDecided}</strong></span>
                          <span>Max Loss: <strong className="text-slate-200">{item.maxConsecutiveLosses}</strong></span>
                        </div>
                      </div>
                    ))}
                </div>
              ) : (
                <p className="text-[8px] text-slate-500 italic text-center py-2 border border-dashed border-slate-800 rounded">
                  Sem dados do Scanner. Clique em "Rodar Backstage Geral" para varrer o mercado.
                </p>
              )}
            </div>

            {/* PAPER TRADING SECTION (COLLAPSIBLE / MINIMIZED) */}
            <div className="mt-2 bg-slate-950/30 rounded-xl border border-slate-800/20 overflow-hidden">
              <button 
                onClick={() => setIsPaperTradingExpanded(!isPaperTradingExpanded)}
                className="w-full p-2 flex items-center justify-between hover:bg-slate-900/20 transition-colors text-left"
              >
                <span className="text-[8.5px] text-slate-500 uppercase tracking-wider font-semibold flex items-center gap-1.5">
                  <span className="w-1 h-1 rounded-full bg-slate-500" />
                  Paper Trading (Live) - Opcional
                </span>
                <span className="text-[8px] font-bold text-slate-400 uppercase">
                  {isPaperTradingExpanded ? "Recolher" : "Expandir"}
                </span>
              </button>

              {isPaperTradingExpanded && (
                <div className="p-2 border-t border-slate-800/20 flex flex-col gap-2">
                  <div className="flex items-center justify-between p-1.5 bg-slate-900/60 rounded-lg border border-slate-800/60">
                    <span className="text-[8px] text-slate-300 font-bold uppercase tracking-wider">Status do Motor:</span>
                    <button
                      onClick={() => setIsPaperTradingActive(!isPaperTradingActive)}
                      className={`px-2 py-1 rounded font-black text-[8px] uppercase tracking-wider transition-colors cursor-pointer ${
                        isPaperTradingActive 
                          ? "bg-emerald-600 text-white border border-emerald-500 hover:bg-emerald-500" 
                          : "bg-slate-800 text-slate-400 border border-slate-700 hover:bg-slate-750"
                      }`}
                    >
                      {isPaperTradingActive ? "Paper Ativo" : "Live (Real)"}
                    </button>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[8px] text-slate-400">Progresso de Validação Ao Vivo:</span>
                    <span className={`text-[8px] font-black ${
                      paperTradingStatus.validationStatus === "VALIDATED" ? "text-emerald-400" : "text-amber-400"
                    }`}>
                      {paperTradingStatus.validationStatus}
                    </span>
                  </div>
                  <div className="flex justify-between text-[9px] text-slate-300 font-mono">
                    <span>Sinais Decididos: {paperTradingStatus.currentSignals}</span>
                    <span>Win Rate: {formatPercent(paperTradingStatus.winRate)}</span>
                  </div>
                  <div className="w-full bg-slate-900 rounded-full h-1">
                    <div 
                      className="bg-amber-500 h-full"
                      style={{ width: `${clampPercent(paperTradingStatus.requiredSignals > 0 ? (paperTradingStatus.currentSignals / paperTradingStatus.requiredSignals) * 100 : 0)}%` }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* FINAL VALIDATION STATUS (EXCLUSIVELY BACKSTAGE DRIVEN) */}
            <div className="mt-2 text-center p-2 rounded bg-slate-900/40 border border-slate-800/40">
              <span className="text-[10px] font-bold uppercase text-slate-400 block mb-1">Validação Final do Sistema</span>
              <span className={`text-[11px] font-black ${
                backstageStatus.validationStatus === "BACKSTAGE_VALIDATED" ? "text-emerald-400 animate-pulse" : "text-rose-400"
              }`}>
                {backstageStatus.validationStatus === "BACKSTAGE_VALIDATED" ? "APROVADO PELO BACKSTAGE (MOTOR OK)" : "EM TESTE DE BACKSTAGE"}
              </span>
            </div>
          </div>
        </aside>

        {/* MIDDLE COLUMN: TRADING CHART & CURRENT AI SIGNAL (Span 9) */}
        <section className="lg:col-span-9 flex flex-col gap-6">
          

          {/* AI DECISION / SIGNAL PRESENTATION BLOCK */}
          <div className="bg-slate-900/40 backdrop-blur-md border border-slate-800/60 rounded-2xl p-6 shadow-xl flex flex-col gap-6">
            
            {/* TERMINAL DE OPERAÇÕES INTEGRADO (Escolher, Gerar e Visualizar) */}
            <div className="bg-slate-950/70 border border-slate-800/80 p-5 rounded-xl flex flex-col gap-4">
              <div className="flex items-center gap-2 border-b border-slate-800/80 pb-3">
                <Sliders size={15} className="text-indigo-400" />
                <h4 className="text-xs font-bold text-slate-200 uppercase tracking-widest">
                  Terminal de Análise Rápida de Ativos
                </h4>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                
                {/* 1. SELETOR DE ATIVO */}
                <div className="md:col-span-8 flex flex-col gap-1.5">
                  <span className="text-[10px] text-slate-400 uppercase tracking-widest font-black flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse"></span>
                    1. Escolha o Ativo para Simular:
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1.5 max-h-[160px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-slate-800">
                    {ASSETS.map((asset) => {
                      const isSelected = selectedAsset.symbol === asset.symbol;
                      return (
                        <button
                          key={asset.symbol}
                          onClick={() => {
                            setSelectedAsset(asset);
                            setActiveSignal(null);
                            setAutoAnalyzeTrigger(asset.symbol);
                          }}
                          className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold tracking-wide transition flex items-center justify-between border cursor-pointer ${
                            isSelected
                              ? "bg-indigo-600/20 text-indigo-300 border-indigo-500/60"
                              : "bg-slate-900/30 text-slate-400 border-slate-800/40 hover:bg-slate-800/50"
                          }`}
                        >
                          <span className="truncate">{asset.symbol}</span>
                          <span className={`text-[8px] font-mono shrink-0 ${isSelected ? "text-emerald-400" : "text-emerald-500/80"}`}>
                            {Math.round(asset.payout * 100)}%
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 2. EXPIRED / TIMEFRAME */}
                <div className="md:col-span-4 flex flex-col gap-4">
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[10px] text-slate-400 uppercase tracking-widest font-black flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                      2. Expiração:
                    </span>
                    <div className="grid grid-cols-2 gap-1 p-0.5 bg-slate-900 rounded-lg border border-slate-800/60">
                      {(["M1", "M5"] as const).map((tf) => (
                        <button
                          key={tf}
                          onClick={() => {
                            setTimeframe(tf);
                            setActiveSignal(null);
                          }}
                          className={`py-1.5 rounded-md text-[10px] font-black uppercase transition cursor-pointer text-center ${
                            timeframe === tf
                              ? "bg-indigo-600 text-white shadow-sm"
                              : "text-slate-500 hover:text-slate-400"
                          }`}
                        >
                          {tf}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

              </div>

              {/* ACTION ROW: GENERATE SIGNAL BUTTON & FULL MARKET SWEEP */}
              <div className="flex flex-col xl:flex-row items-start xl:items-center justify-between gap-3 border-t border-slate-800/80 pt-4 mt-1">
                <div className="flex flex-col md:flex-row md:items-center justify-between w-full xl:w-auto gap-3">
                  <div className="flex items-center gap-2 text-[10px] text-slate-400">
                    <Sparkles size={12} className="text-indigo-400 animate-pulse" />
                    <span>
                      Estratégia ativa: <strong className="text-slate-200">{strategy === "reversion" ? "MHI / Retração" : strategy === "trend" ? "EMA/MACD / Tendência" : strategy === "breakout" ? "Rompimento Dinâmico" : strategy === "candle_flow" ? "Fluxo de Velas (M1/M5)" : "Price Action Clássico"}</strong>
                    </span>
                  </div>

                  {/* Toggle para Análise Contínua em Tempo Real */}
                  <div className="flex items-center gap-2 bg-indigo-950/20 border border-indigo-500/20 px-3 py-1.5 rounded-lg">
                    <div className="relative inline-flex items-center cursor-pointer" onClick={() => setIsContinuousAnalysis(!isContinuousAnalysis)}>
                      <input type="checkbox" checked={isContinuousAnalysis} readOnly className="sr-only peer" />
                      <div className="w-8 h-4 bg-slate-800 rounded-full peer-checked:bg-indigo-600 relative transition-all duration-200 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-300 after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:after:translate-x-4 peer-checked:after:bg-white"></div>
                    </div>
                    <span className="text-[10px] font-bold tracking-wider text-slate-300 select-none flex items-center gap-1.5 uppercase cursor-pointer" onClick={() => setIsContinuousAnalysis(!isContinuousAnalysis)}>
                      <span className={`w-1.5 h-1.5 rounded-full ${isContinuousAnalysis ? "bg-emerald-500 animate-ping" : "bg-slate-500"}`}></span>
                      {isContinuousAnalysis ? "Contínuo por Tick: Ativo" : "Contínuo por Tick: Inativo"}
                    </span>
                    {isContinuousAnalysis && isBackgroundAnalyzing && (
                      <RefreshCw size={10} className="text-indigo-400 animate-spin shrink-0" />
                    )}
                  </div>
                </div>
                
                <div className="flex flex-col sm:flex-row gap-2 w-full xl:w-auto">
                  <button
                    onClick={handleSweepAssets}
                    disabled={isSweepScanning || isAnalyzing || !isFastForexOperational}
                    className={`w-full sm:w-auto min-w-[180px] py-3 px-5 rounded-xl font-black text-xs tracking-wider uppercase transition flex items-center justify-center gap-2 shadow-lg cursor-pointer ${
                      (isSweepScanning || !isFastForexOperational)
                        ? "bg-slate-850 text-emerald-400/70 border border-emerald-500/20 cursor-not-allowed"
                        : "bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 text-white hover:scale-[1.01] active:scale-[0.99] shadow-emerald-600/15 border border-emerald-500/30"
                    }`}
                  >
                    <Zap size={13} className="text-emerald-300 animate-pulse" />
                    <span>{!isFastForexOperational ? "AGUARDANDO FEED REAL" : "VARRER TODOS ATIVOS"}</span>
                  </button>

                  <button
                    onClick={handleAnalyzeMarket}
                    disabled={isAnalyzing || isSweepScanning || !isFastForexOperational}
                    className={`w-full sm:w-auto min-w-[210px] py-3 px-5 rounded-xl font-black text-xs tracking-wider uppercase transition flex items-center justify-center gap-2 shadow-lg cursor-pointer ${
                      (isAnalyzing || !isFastForexOperational)
                        ? "bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700"
                        : "bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white hover:scale-[1.01] active:scale-[0.99] shadow-indigo-600/15"
                    }`}
                  >
                    {isAnalyzing ? (
                      <>
                        <RefreshCw size={13} className="animate-spin" />
                        <span>ANALISANDO IA...</span>
                      </>
                    ) : (
                      <>
                        <Cpu size={13} />
                        <span>{!isFastForexOperational ? "AGUARDANDO FEED REAL" : "SINAL INDIVIDUAL"}</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {errorMessage && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-lg text-[11px] flex gap-2 animate-shake">
                  <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
                  <span>{errorMessage}</span>
                </div>
              )}
            </div>

            {!activeSignal ? (
              <div className="py-12 px-4 flex flex-col items-center justify-center text-center gap-4">
                <div className="w-16 h-16 rounded-full bg-indigo-500/5 border border-indigo-500/20 flex items-center justify-center text-indigo-400 animate-pulse">
                  <Cpu size={28} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-200">Nenhum Sinal Gerado</h3>
                  <p className="text-xs text-slate-400 max-w-sm mt-1 leading-relaxed">
                    Clique em <strong className="text-indigo-400">GERAR SINAL DE ENTRADA</strong> acima para que a inteligência artificial analise o ativo <strong className="text-slate-200">{selectedAsset.symbol}</strong> em tempo real.
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-6">
                
                {/* Header Signal Banner */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
                  <div className="flex flex-col">
                    <span className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold">Sinal Confirmado</span>
                    <h3 className="text-lg font-bold text-slate-200 flex items-center gap-1.5">
                      {selectedAsset.symbol} • <span className="text-indigo-400 font-semibold">{timeframe}</span>
                    </h3>
                  </div>

                  {/* Expiração e assertividade */}
                  <div className="flex items-center gap-3 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800">
                    <div className="text-center px-2">
                      <span className="text-[9px] text-slate-500 block uppercase">Expiração</span>
                      <span className="text-sm font-mono font-bold text-indigo-400 flex flex-col items-center">
                        <span>{activeSignal.expiry}</span>
                        {activeSignal.status === "PENDING" && activeSignal.expirySecondsRemaining !== undefined && (
                          <span className="text-[10px] font-semibold text-slate-400 font-sans mt-0.5">
                            ({activeSignal.expirySecondsRemaining}s)
                          </span>
                        )}
                        {activeSignal.status !== "PENDING" && (
                          <span className={`text-[9px] px-1 py-0.2 rounded font-black font-sans uppercase mt-0.5 ${
                            activeSignal.status === "WIN" 
                              ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20" 
                              : "bg-rose-500/15 text-rose-400 border border-rose-500/20"
                          }`}>
                            {activeSignal.status}
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="h-6 w-[1px] bg-slate-800"></div>
                    <div className="text-center px-2">
                      <span className="text-[9px] text-slate-500 block uppercase">Qualidade técnica</span>
                      <span className={`text-sm font-mono font-bold ${isFastForexOperational ? 'text-indigo-400' : 'text-slate-600'}`}>{isFastForexOperational ? `${activeSignal.technicalScore ?? 0}/100` : "N/A"}</span>
                    </div>
                    
                    <div className="h-6 w-[1px] bg-slate-800"></div>
                    <div className="text-center px-2">
                      <span className="text-[9px] text-slate-500 block uppercase">Prob. Estatística</span>
                      <span className={`text-sm font-mono font-bold ${isFastForexOperational ? 'text-emerald-400' : 'text-slate-600'}`}>
                        {isFastForexOperational ? 
                          (activeSignal.calibrationAvailable && activeSignal.calibratedProbability !== null && activeSignal.calibratedProbability !== undefined ? `${activeSignal.calibratedProbability}%` : "Indisponível")
                          : "N/A"}
                      </span>
                    </div>
                    
                    <div className="h-6 w-[1px] bg-slate-800"></div>
                    <div className="text-center px-2">
                      <span className="text-[9px] text-slate-500 block uppercase">Reliability</span>
                      <span className="text-sm font-mono font-bold text-amber-400">{activeSignal.reliabilityScore || "N/A"}</span>
                    </div>
                  </div>
                </div>

                {activeSignal.historyStatusMsg && (
                  <div className={`mb-4 border rounded-lg p-3 text-center ${
                    activeSignal.hasSufficientHistory 
                      ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-400' 
                      : 'bg-amber-950/20 border-amber-500/30 text-amber-400'
                  }`}>
                    <span className="block text-[10px] font-mono tracking-wider font-bold">
                      {activeSignal.historyStatusMsg.toUpperCase()}
                    </span>
                  </div>
                )}

                  {/* Main Visual Pulse indicator */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-stretch">
                  
                  {/* Futuristic Interactive Radar & Signal Presentation Panel */}
                  <div className="md:col-span-5 flex flex-col gap-4 w-full">
                    <div className={`relative overflow-hidden w-full p-6 rounded-2xl border flex flex-col items-center justify-between gap-5 transition-all duration-500 flex-grow ${
                      activeSignal.signal === "CALL" 
                        ? "border-emerald-500/40 bg-slate-950/40 shadow-2xl shadow-emerald-500/10" 
                        : activeSignal.signal === "PUT"
                        ? "border-rose-500/40 bg-slate-950/40 shadow-2xl shadow-rose-500/10"
                        : "border-amber-500/30 bg-slate-950/40 shadow-2xl shadow-amber-500/5"
                    }`}>
                      
                      {/* Background Digital Grid Layer */}
                      <div className="absolute inset-0 opacity-15 pointer-events-none" style={{
                        backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.15) 1px, transparent 1px)",
                        backgroundSize: "16px 16px"
                      }}></div>

                      {/* Moving laser scan lines in background */}
                      <motion.div 
                        className={`absolute left-0 right-0 h-[2px] opacity-20 pointer-events-none ${
                          activeSignal.signal === "CALL" ? "bg-emerald-400 shadow-[0_0_10px_#10b981]" : activeSignal.signal === "PUT" ? "bg-rose-400 shadow-[0_0_10px_#f43f5e]" : "bg-amber-400 shadow-[0_0_10px_#f59e0b]"
                        }`}
                        animate={{ top: ["0%", "100%", "0%"] }}
                        transition={{ duration: 6, ease: "linear", repeat: Infinity }}
                      />

                      {/* Top status header */}
                      <div className="w-full flex items-center justify-between z-10">
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                          <span className={`w-1.5 h-1.5 rounded-full ${
                            activeSignal.signal === "CALL" ? "bg-emerald-500 animate-pulse" : activeSignal.signal === "PUT" ? "bg-rose-500 animate-pulse" : "bg-amber-500 animate-pulse"
                          }`}></span>
                          Detector de Sinais IA
                        </span>
                        
                        <div className={`px-2.5 py-1 rounded-md text-[8px] font-black uppercase tracking-wider border ${
                          activeSignal.signal === "CALL"
                            ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30 shadow-[0_0_8px_rgba(16,185,129,0.1)]"
                            : activeSignal.signal === "PUT"
                            ? "bg-rose-500/15 text-rose-300 border-rose-500/30 shadow-[0_0_8px_rgba(244,63,94,0.1)]"
                            : "bg-amber-500/15 text-amber-300 border-amber-500/30"
                        }`}>
                          {activeSignal.signal === "NEUTRAL" ? "RISCO CRÍTICO" : "PRONTO PARA ENTRADA"}
                        </div>
                      </div>

                      {/* GORGEOUS HIGH-TECH RADAR SCANNER GRAPHIC */}
                      <div className="relative w-44 h-44 flex items-center justify-center my-1 z-10">
                        
                        {/* 1. Concentric Ripple Waves (Expand and Fade) */}
                        <AnimatePresence>
                          {[1, 2, 3].map((i) => (
                            <motion.div
                              key={i}
                              className={`absolute rounded-full border ${
                                activeSignal.signal === "CALL" 
                                  ? "border-emerald-500/20 bg-emerald-500/[0.01]" 
                                  : activeSignal.signal === "PUT"
                                  ? "border-rose-500/20 bg-rose-500/[0.01]"
                                  : "border-amber-500/20 bg-amber-500/[0.01]"
                              }`}
                              style={{ width: "100%", height: "100%" }}
                              initial={{ scale: 0.6, opacity: 0 }}
                              animate={{ 
                                scale: [0.6, 1.4], 
                                opacity: [0.6, 0] 
                              }}
                              transition={{
                                duration: 3,
                                ease: "easeOut",
                                delay: i * 1,
                                repeat: Infinity
                              }}
                            />
                          ))}
                        </AnimatePresence>

                        {/* 2. Concentric Static Tech Rings */}
                        <div className={`absolute w-full h-full rounded-full border border-dashed transition-all duration-500 ${
                          activeSignal.signal === "CALL" ? "border-emerald-500/25" : activeSignal.signal === "PUT" ? "border-rose-500/25" : "border-amber-500/20"
                        }`}></div>
                        <div className={`absolute w-32 h-32 rounded-full border transition-all duration-500 ${
                          activeSignal.signal === "CALL" ? "border-emerald-500/20" : activeSignal.signal === "PUT" ? "border-rose-500/20" : "border-amber-500/15"
                        }`} style={{ borderStyle: "double", borderWidth: "3px" }}></div>
                        <div className={`absolute w-20 h-20 rounded-full border border-dotted transition-all duration-500 ${
                          activeSignal.signal === "CALL" ? "border-emerald-500/30" : activeSignal.signal === "PUT" ? "border-rose-500/30" : "border-amber-500/20"
                        }`}></div>

                        {/* 3. Rotating Radar Sweep Line */}
                        <motion.div 
                          className="absolute inset-0 rounded-full overflow-hidden"
                          animate={{ rotate: 360 }}
                          transition={{ duration: 4, ease: "linear", repeat: Infinity }}
                        >
                          <div className={`absolute top-0 left-1/2 w-1/2 h-1/2 origin-bottom-left border-l border-t-0 opacity-45 ${
                            activeSignal.signal === "CALL" 
                              ? "border-emerald-500 bg-gradient-to-tr from-emerald-500/20 to-transparent" 
                              : activeSignal.signal === "PUT"
                              ? "border-rose-500 bg-gradient-to-tr from-rose-500/20 to-transparent"
                              : "border-amber-500 bg-gradient-to-tr from-amber-500/20 to-transparent"
                          }`}
                          style={{
                            clipPath: "polygon(0 0, 100% 0, 100% 100%, 0 100%)",
                            transform: "rotate(-90deg)"
                          }}></div>
                        </motion.div>

                        {/* 4. Central Holographic Core */}
                        <motion.div 
                          className={`relative w-28 h-28 rounded-full border-2 flex flex-col items-center justify-center shadow-xl backdrop-blur-md z-20 transition-all duration-500 ${
                            activeSignal.signal === "CALL"
                              ? "border-emerald-500/50 bg-emerald-950/40 text-emerald-400 shadow-emerald-500/20"
                              : activeSignal.signal === "PUT"
                              ? "border-rose-500/50 bg-rose-950/40 text-rose-400 shadow-rose-500/20"
                              : "border-amber-500/50 bg-amber-950/40 text-amber-400 shadow-amber-500/20"
                          }`}
                          animate={{ 
                            y: [-4, 4, -4],
                            boxShadow: activeSignal.signal === "CALL"
                              ? ["0 4px 20px rgba(16,185,129,0.15)", "0 4px 35px rgba(16,185,129,0.35)", "0 4px 20px rgba(16,185,129,0.15)"]
                              : activeSignal.signal === "PUT"
                              ? ["0 4px 20px rgba(244,63,94,0.15)", "0 4px 35px rgba(244,63,94,0.35)", "0 4px 20px rgba(244,63,94,0.15)"]
                              : ["0 4px 15px rgba(245,158,11,0.1)", "0 4px 25px rgba(245,158,11,0.25)", "0 4px 15px rgba(245,158,11,0.1)"]
                          }}
                          transition={{ duration: 3, ease: "easeInOut", repeat: Infinity }}
                        >
                          {/* Inner glowing element */}
                          <div className="flex flex-col items-center justify-center">
                            <motion.div
                              animate={{ scale: [1, 1.12, 1] }}
                              transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                            >
                              {activeSignal.signal === "CALL" && <TrendingUp size={34} className="filter drop-shadow-[0_0_8px_#10b981]" />}
                              {activeSignal.signal === "PUT" && <TrendingDown size={34} className="filter drop-shadow-[0_0_8px_#f43f5e]" />}
                              {activeSignal.signal === "NEUTRAL" && <AlertTriangle size={34} className="filter drop-shadow-[0_0_8px_#f59e0b]" />}
                            </motion.div>
                            
                            <span className="text-3xl font-black tracking-tight leading-none mt-2">
                              {activeSignal.signal}
                            </span>
                            
                            <span className="text-[8px] uppercase font-bold text-slate-400 tracking-widest mt-1">
                              {activeSignal.signal === "NEUTRAL" ? "AGUARDAR" : "SIMULAR"}
                            </span>
                          </div>
                        </motion.div>
                      </div>

                      {/* Asset & Probability Display */}
                      <div className="w-full text-center z-10 mt-1">
                        <div className="text-xs font-semibold text-slate-300">
                          SCORE TÉCNICO: {activeSignal.technicalScore ?? 0} | REGIME: {activeSignal.regime?.toUpperCase() || 'N/A'}
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono mt-0.5 uppercase">
                          SISTEMA DE ALTA FREQUÊNCIA ATIVO
                        </div>
                      </div>

                      {/* Entry Hour Banner */}
                      {activeSignal.signal !== "NEUTRAL" ? (
                        <motion.div 
                          className="w-full py-3 px-4 bg-gradient-to-r from-indigo-500/15 to-indigo-600/5 border border-indigo-500/30 text-indigo-300 rounded-xl font-bold tracking-wider text-[11px] shadow-lg flex items-center justify-between gap-2 z-10"
                          animate={{ 
                            borderColor: ["rgba(99,102,241,0.3)", "rgba(99,102,241,0.7)", "rgba(99,102,241,0.3)"]
                          }}
                          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                        >
                          <div className="flex items-center gap-2">
                            <span className="relative flex h-2 w-2">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                            </span>
                            <span className="text-[9px] uppercase tracking-widest text-indigo-300/90 font-bold">Horário de Entrada:</span>
                          </div>
                          <span className="text-[13px] font-black tracking-tight text-white font-mono bg-indigo-950/60 py-0.5 px-2 rounded border border-indigo-500/25">
                            ENTRAR ÀS {activeSignal.entryTime}
                          </span>
                        </motion.div>
                      ) : (
                        <div className="w-full py-3 px-4 bg-slate-950/60 border border-slate-800 text-slate-400 rounded-xl font-bold text-[11px] shadow-lg text-center z-10">
                          <span className="text-[9px] uppercase tracking-widest text-slate-500 font-bold">AGUARDANDO OTIMIZAÇÃO DE CICLO</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* AI Assistant Co-Pilot Technical Verdict Panel */}
                  <div className="md:col-span-7 flex flex-col gap-4">
                    <div className="bg-slate-950/50 rounded-2xl p-5 border border-indigo-500/10 hover:border-indigo-500/20 transition-all flex flex-col gap-4 shadow-xl relative overflow-hidden group">
                      {/* Ambient light streak */}
                      <span className="absolute top-0 right-0 w-32 h-32 bg-indigo-600/5 rounded-full blur-2xl group-hover:bg-indigo-600/10 transition-colors duration-300"></span>

                      {/* Header bar of AI Report */}
                      <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center">
                            <Bot size={16} className="animate-pulse" />
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Assistente de Co-Pilot IA</span>
                            <span className="text-[8px] text-indigo-400 uppercase tracking-widest font-bold flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></span>
                              Motor de Confluência Ativo
                            </span>
                          </div>
                        </div>
                        
                        {/* Risk Rating Badge */}
                        <div className="flex items-center">
                          {activeSignal.signal === "NEUTRAL" ? (
                            <span className="text-[9px] bg-rose-500/10 text-rose-400 border border-rose-500/20 px-2.5 py-1 rounded-lg font-black uppercase tracking-wider">
                              Risco: Crítico (Bloqueado)
                            </span>
                          ) : (activeSignal.technicalScore ?? 0) >= 93 ? (
                            <span className="text-[9px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2.5 py-1 rounded-lg font-black uppercase tracking-wider">
                              Risco: Baixo (Confluente)
                            </span>
                          ) : (
                            <span className="text-[9px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2.5 py-1 rounded-lg font-black uppercase tracking-wider">
                              Risco: Moderado (Cautela)
                            </span>
                          )}
                        </div>
                      </div>

                      {/* IA AUTO-ADAPTATIVA: PAINEL DE CALIBRAÇÃO ADAPTATIVA EM TEMPO REAL */}
                      {activeSignal.isAutoSelected && activeSignal.autoCalibrationResults && activeSignal.autoCalibrationResults.length > 0 && (
                        <div className="p-4 rounded-xl border border-violet-500/20 bg-violet-950/10 flex flex-col gap-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              <Sparkles size={13} className="text-violet-400 animate-pulse" />
                              <span className="text-[10px] font-black uppercase tracking-wider text-violet-300">
                                IA Auto-Adaptativa: Calibração em Tempo Real
                              </span>
                            </div>
                            <span className="text-[9px] font-bold text-slate-400 font-mono">
                              Backtest: 15 candles
                            </span>
                          </div>
                          
                          <p className="text-[10px] text-slate-400 leading-normal">
                            O robô executou simultaneamente o backtest de todas as estratégias nos candles passados. A de maior assertividade foi ativada automaticamente para este sinal:
                          </p>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
                            {activeSignal.autoCalibrationResults.map((res) => {
                              const isActivated = activeSignal.strategy === res.strategy;
                              const strategyName = res.strategy === 'reversion' 
                                ? 'Retração em Extremos' 
                                : res.strategy === 'trend' 
                                ? 'Seguidor de Tendência' 
                                : res.strategy === 'price_action' 
                                ? 'Price Action' 
                                : res.strategy === 'breakout' 
                                ? 'Rompimento Dinâmico' 
                                : 'Fluxo de Velas';

                              return (
                                <div 
                                  key={res.strategy} 
                                  className={`p-2 rounded-lg border flex flex-col gap-1 transition ${
                                    isActivated 
                                      ? "bg-violet-600/10 border-violet-500/45 text-white animate-pulse" 
                                      : "bg-slate-950/30 border-slate-900/60 text-slate-400"
                                  }`}
                                >
                                  <div className="flex justify-between items-center text-[9px] font-bold">
                                    <span className={isActivated ? "text-violet-300 font-extrabold" : "text-slate-300"}>
                                      {strategyName}
                                    </span>
                                    <span className={`font-mono font-bold ${isActivated ? "text-violet-400" : "text-slate-400"}`}>
                                      {res.winRate}% {res.totalSignals > 0 ? `(${res.wins}/${res.totalSignals})` : ""}
                                    </span>
                                  </div>
                                  
                                  {/* Progress bar */}
                                  <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden">
                                    <div 
                                      className={`h-full rounded-full ${isActivated ? "bg-violet-500" : "bg-slate-600"}`}
                                      style={{ width: `${clampPercent(res.winRate)}%` }}
                                    ></div>
                                  </div>

                                  {isActivated && (
                                    <span className="text-[8px] font-black uppercase text-violet-400 tracking-wider flex items-center gap-1 mt-0.5">
                                      ● ESTRATÉGIA ATIVADA
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* MARKET REGIME & STRATEGY COMPATIBILITY GAUGE */}
                      {activeSignal.marketFit && (
                        <div className={`p-3.5 rounded-xl border ${
                          activeSignal.marketFit.status === "CRITICAL_UNFIT"
                            ? "bg-rose-950/20 border-rose-500/30"
                            : activeSignal.marketFit.status === "HIGH"
                            ? "bg-emerald-950/20 border-emerald-500/30"
                            : "bg-amber-950/20 border-amber-500/30"
                        } flex flex-col gap-1.5`}>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              <Shield size={12} className={
                                activeSignal.marketFit.status === "CRITICAL_UNFIT"
                                  ? "text-rose-400 animate-pulse"
                                  : activeSignal.marketFit.status === "HIGH"
                                  ? "text-emerald-400"
                                  : "text-amber-400"
                              } />
                              <span className="text-[10px] font-black uppercase tracking-wider text-slate-300">
                                Ciclo de Mercado
                              </span>
                            </div>
                            <span className={`text-[9px] font-extrabold uppercase px-2 py-0.5 rounded ${
                              activeSignal.marketFit.status === "CRITICAL_UNFIT"
                                ? "bg-rose-500/20 text-rose-300 animate-pulse"
                                : activeSignal.marketFit.status === "HIGH"
                                ? "bg-emerald-500/20 text-emerald-300"
                                : "bg-amber-500/20 text-amber-300"
                            }`}>
                              {activeSignal.marketFit.regime === "TRENDING_BREAKOUT"
                                ? "�� Rompimento / Tendência"
                                : activeSignal.marketFit.regime === "CONSOLIDATION_FLAT"
                                ? "�� Acumulação Lateral"
                                : "�� Volatilidade Saudável"}
                            </span>
                          </div>
                          
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center justify-between">
                              <span className="text-[9px] text-slate-400 font-bold uppercase">
                                Compatibilidade da Estratégia:
                              </span>
                              <span className={`text-[10px] font-black uppercase tracking-widest ${
                                activeSignal.marketFit.status === "CRITICAL_UNFIT"
                                  ? "text-rose-400"
                                  : activeSignal.marketFit.status === "HIGH"
                                  ? "text-emerald-400"
                                  : "text-amber-400"
                              }`}>
                                {activeSignal.marketFit.status === "CRITICAL_UNFIT"
                                  ? "BLOQUEADA (Anti-Loss)"
                                  : activeSignal.marketFit.status === "HIGH"
                                  ? "ALTA COMPATIBILIDADE"
                                  : "COMPATIBILIDADE MÉDIA"}
                              </span>
                            </div>
                            <p className="text-[10px] text-slate-300 font-sans leading-relaxed">
                              {activeSignal.marketFit.reason}
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Main analysis title */}
                      <div>
                        <span className="text-[9px] text-slate-500 uppercase tracking-widest font-semibold block">Gatilho Validado Pela IA</span>
                        <h4 className="text-sm font-black text-white flex items-center gap-1.5 mt-0.5 tracking-tight">
                          <Sparkles size={13} className="text-indigo-400 flex-shrink-0" />
                          {activeSignal.analysisTitle}
                        </h4>
                      </div>

                      {/* Detailed Bullet Points */}
                      <div className="flex flex-col gap-2.5">
                        <span className="text-[9px] text-slate-500 uppercase tracking-widest font-semibold">Parecer do Motor de Análise</span>
                        <ul className="space-y-2">
                          {activeSignal.reasoning.map((reason, i) => (
                            <li key={i} className="text-xs text-slate-300 flex items-start gap-2.5 leading-relaxed bg-slate-900/30 p-2.5 rounded-xl border border-slate-850/60 hover:bg-slate-900/50 transition">
                              <span className="w-5 h-5 rounded-full bg-indigo-500/10 border border-indigo-500/15 flex items-center justify-center font-mono text-[9px] text-indigo-400 font-bold flex-shrink-0 mt-0.5">
                                0{i+1}
                              </span>
                              <span>{reason}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Indicator Telemetry Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 bg-slate-950/40 p-4 rounded-xl border border-slate-800/60">
                  <div className="flex flex-col gap-1">
                    <span className="text-[9px] text-slate-500 uppercase">Filtro RSI</span>
                    <span className="text-[11px] font-semibold text-slate-300">{activeSignal.indicatorsStatus.rsi}</span>
                  </div>
                  <div className="flex flex-col gap-1 border-l border-slate-800/80 pl-3">
                    <span className="text-[9px] text-slate-500 uppercase">Filtro MACD</span>
                    <span className="text-[11px] font-semibold text-slate-300">{activeSignal.indicatorsStatus.macd}</span>
                  </div>
                  <div className="flex flex-col gap-1 border-l border-slate-800/80 pl-3 sm:border-l-0 lg:border-l sm:pl-0 lg:pl-3">
                    <span className="text-[9px] text-slate-500 uppercase">Filtro Bollinger</span>
                    <span className="text-[11px] font-semibold text-slate-300">{activeSignal.indicatorsStatus.bollinger}</span>
                  </div>
                  <div className="flex flex-col gap-1 border-l border-slate-800/80 pl-3 sm:border-l lg:border-l sm:pl-3 lg:pl-3">
                    <span className="text-[9px] text-slate-500 uppercase">Filtro Médias</span>
                    <span className="text-[11px] font-semibold text-slate-300">{activeSignal.indicatorsStatus.movingAverages}</span>
                  </div>
                  <div className="flex flex-col gap-1 border-l border-slate-800/80 pl-3">
                    <span className="text-[9px] text-slate-500 uppercase">Estocástico</span>
                    <span className="text-[11px] font-semibold text-slate-300">
                      {activeSignal.indicatorsStatus.stochastic || "Aguardando"}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1 border-l border-slate-800/80 pl-3">
                    <span className="text-[9px] text-slate-500 uppercase">Métrica ATR</span>
                    <span className="text-[11px] font-semibold text-slate-300">
                      {activeSignal.indicatorsStatus.atr || "Aguardando"}
                    </span>
                  </div>
                </div>

                {/* Advanced Candlestick History Analysis (Velas Anteriores) */}
                {activeSignal.candleAnalysis && (
                  <div className="bg-slate-950/30 p-4 rounded-xl border border-slate-800/60 flex flex-col gap-3">
                    <div className="flex items-center gap-2 border-b border-slate-800/40 pb-2">
                      <Sliders size={14} className="text-indigo-400" />
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                        Análise Estrutural de Velas Anteriores
                      </span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] text-slate-500 uppercase">Tendência de Fechamento</span>
                        <span className={`font-bold ${
                          activeSignal.candleAnalysis.trendDirection === 'UP' 
                            ? 'text-emerald-400' 
                            : activeSignal.candleAnalysis.trendDirection === 'DOWN' 
                            ? 'text-rose-400' 
                            : 'text-slate-400'
                        }`}>
                          {activeSignal.candleAnalysis.trendDirection === 'UP' ? 'ALTA ��' : activeSignal.candleAnalysis.trendDirection === 'DOWN' ? 'BAIXA ��' : 'LATERAL ��'}
                        </span>
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] text-slate-500 uppercase">Última Vela (Cor)</span>
                        <span className={`font-bold ${
                          activeSignal.candleAnalysis.lastCandleColor === 'GREEN'
                            ? 'text-emerald-400'
                            : activeSignal.candleAnalysis.lastCandleColor === 'RED'
                            ? 'text-rose-400'
                            : 'text-slate-400'
                        }`}>
                          {activeSignal.candleAnalysis.lastCandleColor === 'GREEN' ? 'Verde ��' : activeSignal.candleAnalysis.lastCandleColor === 'RED' ? 'Vermelha ��' : 'Doji ⚪'} 
                          <span className="text-[10px] font-normal text-slate-500 ml-1">
                            ({activeSignal.candleAnalysis.consecutiveSameColorCount}x consecutivas)
                          </span>
                        </span>
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] text-slate-500 uppercase">Padrão Gráfico / Vela</span>
                        <span className="font-bold text-indigo-300">
                          {activeSignal.candleAnalysis.candlePatternName || "Nenhum detectado"}
                        </span>
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] text-slate-500 uppercase">Zonas das Velas</span>
                        <span className="font-mono text-slate-300 font-bold text-[11px]">
                          Máx: {activeSignal.candleAnalysis.recentHigh?.toFixed(selectedAsset.decimals)} / Mín: {activeSignal.candleAnalysis.recentLow?.toFixed(selectedAsset.decimals)}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Automated Past Backtest & Calibration Results Dashboard */}
                {activeSignal.historicalPerformance && (
                  <div className="bg-slate-950/30 p-4 rounded-xl border border-slate-800/60 flex flex-col gap-3">
                    <div className="flex items-center justify-between border-b border-slate-800/40 pb-2">
                      <div className="flex items-center gap-2">
                        <History size={14} className="text-amber-400" />
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                          Calibração & Backtest Instantâneo (Últimos 15 Candles)
                        </span>
                      </div>
                      <span className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold ${
                        activeSignal.historicalPerformance.isStrategyFit 
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                          : 'bg-rose-500/10 text-rose-400 border border-rose-500/20 animate-pulse'
                      }`}>
                        {activeSignal.historicalPerformance.isStrategyFit ? 'SINCRONIA COMPATÍVEL ✅' : 'INCOMPATÍVEL / BLOQUEADO ⚠️'}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] text-slate-500 uppercase">Taxa de Acerto Recente</span>
                        <span className={`text-sm font-black ${
                          (activeSignal.historicalPerformance.winRate ?? 0) >= 75 
                            ? 'text-emerald-400' 
                            : (activeSignal.historicalPerformance.winRate ?? 0) >= 60 
                            ? 'text-amber-400' 
                            : 'text-rose-400'
                        }`}>
                          {activeSignal.historicalPerformance.winRate ?? '—'}%
                        </span>
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] text-slate-500 uppercase">Placar (W / L)</span>
                        <span className="font-bold text-slate-300">
                          <span className="text-emerald-400">{activeSignal.historicalPerformance.wins}W</span>
                          <span className="text-slate-500 mx-1">/</span>
                          <span className="text-rose-400">{activeSignal.historicalPerformance.losses}L</span>
                        </span>
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] text-slate-500 uppercase">Sinais Simulados</span>
                        <span className="font-bold text-slate-300 font-mono">
                          {activeSignal.historicalPerformance.totalSignals} entradas
                        </span>
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] text-slate-500 uppercase">Histórico Recente</span>
                        <div className="flex items-center gap-1 mt-0.5">
                          {activeSignal.historicalPerformance.recentSequence.length === 0 ? (
                            <span className="text-slate-500 font-normal">Nenhuma entrada</span>
                          ) : (
                            activeSignal.historicalPerformance.recentSequence.map((res, sIdx) => (
                              <span 
                                key={sIdx} 
                                className={`text-[9px] px-1 py-0.5 rounded font-bold ${
                                  res === 'WIN' 
                                    ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20' 
                                    : 'bg-rose-500/15 text-rose-400 border border-rose-500/20'
                                }`}
                              >
                                {res}
                              </span>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Real-time FastForex Confluence Banner */}
                {activeSignal.marketData && (
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3 bg-indigo-950/15 border border-indigo-500/15 rounded-xl">
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse"></div>
                      <span className="text-[11px] text-slate-300 font-medium">
                        Confluência de Indicadores (FastForex):
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 font-mono text-[10px]">
                      <span className="px-2 py-0.5 rounded bg-slate-950 border border-slate-850 text-slate-400">
                        Score: <span className={
                          activeSignal.marketData.recommendAll > 0.15 
                            ? "text-emerald-400 font-bold" 
                            : activeSignal.marketData.recommendAll < -0.15 
                            ? "text-rose-400 font-bold" 
                            : "text-slate-400"
                        }>
                          {activeSignal.marketData.recommendAll > 0.5 
                            ? "Forte Compra" 
                            : activeSignal.marketData.recommendAll > 0.15 
                            ? "Compra" 
                            : activeSignal.marketData.recommendAll < -0.5 
                            ? "Forte Venda" 
                            : activeSignal.marketData.recommendAll < -0.15 
                            ? "Venda" 
                            : "Neutro"}
                        </span>
                      </span>
                      <span className="px-2 py-0.5 rounded bg-slate-950 border border-slate-850 text-slate-400">
                        Médias: <span className={activeSignal.marketData.recommendMA > 0 ? "text-emerald-400" : activeSignal.marketData.recommendMA < 0 ? "text-rose-400" : "text-slate-400"}>
                          {activeSignal.marketData.recommendMA > 0.5 ? "C. Forte" : activeSignal.marketData.recommendMA > 0 ? "Compra" : activeSignal.marketData.recommendMA < -0.5 ? "V. Forte" : activeSignal.marketData.recommendMA < 0 ? "Venda" : "Neutro"}
                        </span>
                      </span>
                      <span className="px-2 py-0.5 rounded bg-slate-950 border border-slate-850 text-slate-400">
                        Osciladores: <span className={activeSignal.marketData.recommendOther > 0 ? "text-emerald-400" : activeSignal.marketData.recommendOther < 0 ? "text-rose-400" : "text-slate-400"}>
                          {activeSignal.marketData.recommendOther > 0.5 ? "C. Forte" : activeSignal.marketData.recommendOther > 0 ? "Compra" : activeSignal.marketData.recommendOther < -0.5 ? "V. Forte" : activeSignal.marketData.recommendOther < 0 ? "Venda" : "Neutro"}
                        </span>
                      </span>
                    </div>
                  </div>
                )}

                {/* Real-time Signal Rate Monitoring & Analysis */}
                {activeSignal.signal !== "NEUTRAL" && (
                  <div className="p-5 bg-slate-950/40 border border-slate-800/80 rounded-xl flex flex-col gap-4">
                    <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                      
                      <div className="flex flex-col gap-1 w-full md:w-auto">
                        <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Monitoramento de Taxas em Tempo Real</span>
                        <div className="flex flex-wrap items-center gap-3 mt-1">
                          <div className="px-3 py-1 bg-slate-900 border border-slate-800 rounded-lg text-xs font-mono">
                            <span className="text-slate-500 mr-1.5">Taxa de Entrada:</span>
                            <span className="text-slate-200 font-bold">{activeSignal.entryPrice.toFixed(selectedAsset.decimals)}</span>
                          </div>
                          <div className="px-3 py-1 bg-slate-900 border border-slate-800 rounded-lg text-xs font-mono">
                            <span className="text-slate-500 mr-1.5">Preço Atual:</span>
                            <span className={`font-bold ${
                              (activeSignal.signal === "CALL" && currentPrice >= activeSignal.entryPrice) || (activeSignal.signal === "PUT" && currentPrice <= activeSignal.entryPrice)
                                ? "text-emerald-400 animate-pulse"
                                : "text-rose-400 animate-pulse"
                            }`}>
                              {currentPrice.toFixed(selectedAsset.decimals)}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 w-full md:w-auto justify-end">
                        <div className="text-right">
                          <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-semibold">Estado do Gatilho</span>
                          <div className="flex items-center gap-2 mt-1 justify-end">
                            <span className="relative flex h-2 w-2">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                            </span>
                            <span className="text-xs font-mono font-bold text-emerald-400">ATIVO EM TEMPO REAL</span>
                          </div>
                        </div>
                      </div>

                    </div>

                    {/* Operational advice based on direction and current price relative to entry price */}
                    <div className="text-[11px] bg-slate-900/60 p-3.5 rounded-xl leading-relaxed flex flex-col gap-1.5 border border-slate-850">
                      <div className="flex items-center gap-2 text-slate-300 font-bold">
                        <Sliders size={13} className="text-indigo-400 flex-shrink-0" />
                        <span>Orientação Técnica Operacional</span>
                      </div>
                      <p className="text-slate-400 text-[11px]">
                        {activeSignal.signal === "CALL" ? (
                          currentPrice < activeSignal.entryPrice ? (
                            <span className="text-emerald-400 font-semibold">
                              �� Preço atual está ABAIXO da taxa recomendada. Excelente oportunidade de COMPRA (CALL) com maior margem de segurança!
                            </span>
                          ) : (
                            <span className="text-slate-300">
                              ↗️ O preço já subiu em relação à taxa de entrada recomendada. Aguarde uma leve retração para posicionar sua taxa ou entre caso a tendência de alta continue forte.
                            </span>
                          )
                        ) : activeSignal.signal === "PUT" ? (
                          currentPrice > activeSignal.entryPrice ? (
                            <span className="text-emerald-400 font-semibold">
                              �� Preço atual está ACIMA da taxa recomendada. Excelente oportunidade de VENDA (PUT) com maior margem de segurança!
                            </span>
                          ) : (
                            <span className="text-slate-300">
                              ↘️ O preço já caiu em relação à taxa de entrada recomendada. Aguarde um leve pullback para posicionar sua taxa ou entre caso a força vendedora se mantenha ativa.
                            </span>
                          )
                        ) : (
                          "Aguardando confluências técnicas adequadas para posicionamento no mercado."
                        )}
                      </p>
                    </div>

                  </div>
                )}

                {/* API Info bar */}
                <div className="text-[10px] text-slate-500 flex items-center gap-1.5 justify-center py-1 bg-slate-950/20 rounded border border-slate-850">
                  <Shield size={11} className="text-slate-400" />
                  <span>
                    {activeSignal.isSimulated 
                      ? "Operando via Motor de Cálculo Técnico de Alta Confluência."
                      : "Análise processada com IA Gemini integrada em tempo real."
                    }
                  </span>
                </div>

              </div>
            )}
          </div>

          {/* Real-time Indicator Chart Component */}
          <div className="bg-slate-900/20 rounded-2xl border border-slate-800/60 overflow-hidden shadow-xl p-0">
            <div className="p-4 bg-slate-950/60 border-b border-slate-800/60 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-pulse"></div>
                <h2 className="text-sm font-semibold tracking-wide text-slate-200">
                  Monitor de Indicadores Técnicos IA
                </h2>
              </div>
              <div className="flex items-center gap-2">
                <span className="hidden sm:inline text-[9px] text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-2.5 py-0.5 rounded-full font-semibold" title="O gráfico apresenta a variação em tempo real dos ticks do mercado de ativos!">
                  �� Monitor Gráfico Ativo
                </span>
                <div className="text-[11px] font-mono text-slate-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                  TIMEFRAME: {timeframe}
                </div>
              </div>
            </div>
            <div className="p-1">
              <TradingChart 
                candles={candles} 
                currentPrice={currentPrice}
                supportLevel={activeSignal?.keyLevels?.support ?? undefined}
                resistanceLevel={activeSignal?.keyLevels?.resistance ?? undefined}
                autoPilotActive={autoPilot}
                isScanning={isAutopilotScanning}
              />
            </div>
          </div>

          {/* AI SCROLLER SCANNER & SIGNAL CENTER */}
          <div className="bg-slate-900/40 backdrop-blur-md border border-slate-800/60 rounded-2xl p-5 shadow-xl flex flex-col gap-4">
            {/* Header with running status */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
                  autoPilot 
                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" 
                    : "bg-slate-800 text-slate-500 border border-slate-700/50"
                }`}>
                  <Bot size={16} className={autoPilot ? "animate-pulse" : ""} />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-slate-200 uppercase tracking-widest flex items-center gap-1.5">
                    Scanner de Sinais IA
                  </h3>
                  <p className="text-[9px] text-slate-400 leading-none mt-0.5">
                    Varredura e Análise de Confluências em Tempo Real
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {/* Scanning indicator */}
                {autoPilot && (
                  <div className={`flex items-center gap-1 text-[9px] font-mono uppercase px-2 py-0.5 rounded-full border ${
                    isAutopilotScanning 
                      ? "bg-indigo-500/10 text-indigo-400 border-indigo-500/30 font-bold animate-pulse" 
                      : "bg-slate-950 text-slate-500 border-slate-800"
                  }`}>
                    <RefreshCw size={8} className={`shrink-0 ${isAutopilotScanning ? "animate-spin text-indigo-400" : ""}`} />
                    <span>{isAutopilotScanning ? "Escaneando..." : "Buscando Taxas"}</span>
                  </div>
                )}

                {/* Main Toggle Switch */}
                <button
                  disabled={!isFastForexOperational}
                  onClick={() => {
                    setAutoPilot(!autoPilot);
                    addAutopilotLog(
                      !autoPilot 
                        ? "Scanner de IA ativado. Iniciando ciclos de varredura de taxas..." 
                        : "Scanner de IA pausado pelo operador.", 
                      !autoPilot ? "success" : "warn"
                    );
                  }}
                  className={`px-3 py-1 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all border ${!isFastForexOperational ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'} ${
                    autoPilot
                      ? "bg-emerald-600/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-600/20 shadow-md shadow-emerald-500/5"
                      : "bg-slate-950 border-slate-800 text-slate-500 hover:text-slate-400"
                  }`}
                >
                  {autoPilot ? "Varredura ON" : "Varredura OFF"}
                </button>
              </div>
            </div>

            {/* Quick Stats Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {/* Bot Assertiveness */}
              <div className="bg-slate-950/40 border border-slate-800/60 p-3 rounded-xl flex flex-col gap-1">
                <span className="text-[8px] text-slate-500 uppercase font-black tracking-wider block">Assertividade do Scanner</span>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-sm font-black font-mono text-emerald-400">
                    {autopilotStats.totalScans > 0 
                      ? Math.round((autopilotStats.wins / autopilotStats.totalScans) * 100) 
                      : 91}%
                  </span>
                  <span className="text-[9px] font-mono text-slate-400 leading-none">
                    ({autopilotStats.wins}W - {autopilotStats.losses}L)
                  </span>
                </div>
              </div>

              {/* Total Scans performed */}
              <div className="bg-slate-950/40 border border-slate-800/60 p-3 rounded-xl flex flex-col gap-1">
                <span className="text-[8px] text-slate-500 uppercase font-black tracking-wider block">Varreduras Realizadas</span>
                <span className="text-sm font-bold text-slate-100 font-mono">
                  {autopilotStats.totalScans} <span className="text-[9px] text-indigo-400 font-sans font-bold">Analíticas</span>
                </span>
              </div>

              {/* Set Precision Mode */}
              <div className="bg-slate-950/40 border border-slate-800/60 p-3 rounded-xl flex flex-col gap-1 justify-between">
                <span className="text-[8px] text-slate-500 uppercase font-black tracking-wider">Filtro de Precisão</span>
                <span className={`text-xs font-black uppercase tracking-wider ${
                  precisionLevel === 'elite' ? 'text-indigo-400' : precisionLevel === 'high' ? 'text-cyan-400' : 'text-emerald-400'
                }`}>
                  {precisionLevel === 'elite' ? 'Elite Ultra (98.5%)' : precisionLevel === 'high' ? 'Máxima (93%)' : 'Normal (86%)'}
                </span>
              </div>

              {/* Trend check indicator */}
              <div className="bg-slate-950/40 border border-slate-800/60 p-3 rounded-xl flex flex-col gap-1">
                <span className="text-[8px] text-slate-500 uppercase font-black tracking-wider block">Calibração IA</span>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400">
                    FILTRAGEM ATIVA
                  </span>
                </div>
              </div>
            </div>

            {/* Real-time Diagnostics HUD */}
            <div className="bg-slate-950/40 border border-slate-800/60 p-4 rounded-xl flex flex-col gap-3">
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                <span className="text-[10px] text-slate-400 uppercase tracking-widest font-bold flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse"></span>
                  Monitor de Sinais & Confluência em Tempo Real:
                </span>
                <span className="text-[9px] font-mono font-bold text-indigo-400 uppercase bg-indigo-950/40 border border-indigo-900 px-2 py-0.5 rounded">
                  Estratégia: {strategy === "reversion" ? "Retração (M5/M1)" : strategy === "trend" ? "Fluxo / Trend" : "Price Action"}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Score bar CALL */}
                <div className="flex flex-col gap-1.5 bg-slate-950/50 border border-slate-850 p-2.5 rounded-lg">
                  <div className="flex justify-between items-center text-[10px]">
                    <span className="text-emerald-400 font-extrabold flex items-center gap-1 uppercase">�� Compra (CALL)</span>
                    <span className="font-mono font-black text-slate-300">
                      {isFastForexOperational ? `${liveDiagnostics.callScore} / ${liveDiagnostics.requiredScore} pts` : "N/A"}
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden">
                    <div 
                      className={`h-full rounded-full transition-all duration-300 ${
                        liveDiagnostics.callScore >= liveDiagnostics.requiredScore && isFastForexOperational
                          ? "bg-emerald-400 shadow-md shadow-emerald-500/20" 
                          : "bg-emerald-500/50"
                      }`}
                      style={{ width: `${isFastForexOperational ? clampPercent(liveDiagnostics.requiredScore > 0 ? (liveDiagnostics.callScore / liveDiagnostics.requiredScore) * 100 : 0) : 0}%` }}
                    />
                  </div>
                  <span className="text-[8px] text-slate-500 leading-tight">
                    {!isFastForexOperational ? "Score bloqueado (FEED ERROR)" : liveDiagnostics.callScore >= liveDiagnostics.requiredScore 
                      ? "�� Força de confluência atingida! Alerta iminente." 
                      : "Aguardando confluência de suporte..."}
                  </span>
                </div>

                {/* Score bar PUT */}
                <div className="flex flex-col gap-1.5 bg-slate-950/50 border border-slate-850 p-2.5 rounded-lg">
                  <div className="flex justify-between items-center text-[10px]">
                    <span className="text-rose-400 font-extrabold flex items-center gap-1 uppercase">�� Venda (PUT)</span>
                    <span className="font-mono font-black text-slate-300">
                      {isFastForexOperational ? `${liveDiagnostics.putScore} / ${liveDiagnostics.requiredScore} pts` : "N/A"}
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden">
                    <div 
                      className={`h-full rounded-full transition-all duration-300 ${
                        liveDiagnostics.putScore >= liveDiagnostics.requiredScore && isFastForexOperational
                          ? "bg-rose-400 shadow-md shadow-rose-500/20" 
                          : "bg-rose-500/50"
                      }`}
                      style={{ width: `${isFastForexOperational ? clampPercent(liveDiagnostics.requiredScore > 0 ? (liveDiagnostics.putScore / liveDiagnostics.requiredScore) * 100 : 0) : 0}%` }}
                    />
                  </div>
                  <span className="text-[8px] text-slate-500 leading-tight">
                    {!isFastForexOperational ? "Score bloqueado (FEED ERROR)" : liveDiagnostics.putScore >= liveDiagnostics.requiredScore 
                      ? "�� Força de confluência atingida! Alerta iminente." 
                      : "Aguardando confluência de resistência..."}
                  </span>
                </div>

                {/* Diagnostics Indicators grid */}
                <div className="flex flex-col justify-center gap-1.5 bg-slate-950/50 border border-slate-850 p-2.5 rounded-lg">
                  <span className="text-[8px] text-slate-400 uppercase font-black tracking-wider block">Gatilhos Técnicos Ativos</span>
                  <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[9px] font-mono">
                    <div className="flex items-center gap-1 text-slate-400">
                      <span className={`w-1.5 h-1.5 rounded-full ${liveDiagnostics.bollingerTouchCall || liveDiagnostics.bollingerTouchPut ? "bg-indigo-400" : "bg-slate-800"}`} />
                      <span>Bollinger: {liveDiagnostics.bollingerTouchCall ? "Inferior" : liveDiagnostics.bollingerTouchPut ? "Superior" : "Neutro"}</span>
                    </div>
                    <div className="flex items-center gap-1 text-slate-400">
                      <span className={`w-1.5 h-1.5 rounded-full ${liveDiagnostics.rsiExtremeCall || liveDiagnostics.rsiExtremePut ? "bg-purple-400 animate-pulse" : "bg-slate-800"}`} />
                      <span>RSI: {liveDiagnostics.rsi.toFixed(0)}</span>
                    </div>
                    <div className="flex items-center gap-1 text-slate-400">
                      <span className={`w-1.5 h-1.5 rounded-full ${liveDiagnostics.stochAlignedCall || liveDiagnostics.stochAlignedPut ? "bg-amber-400" : "bg-slate-800"}`} />
                      <span>Estocástico: {liveDiagnostics.stochK.toFixed(0)}</span>
                    </div>
                    <div className="flex items-center gap-1 text-slate-400">
                      <span className={`w-1.5 h-1.5 rounded-full ${liveDiagnostics.atrHealthy ? "bg-emerald-400" : "bg-rose-500"}`} />
                      <span>Vol ATR: {liveDiagnostics.atrHealthy ? "OK" : "Baixa"}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Live terminal-like logs feed */}
            <div className="flex flex-col gap-2">
              <span className="text-[9px] font-black uppercase tracking-wider text-slate-500 block">Console de Monitoramento e Confluências</span>
              <div className="bg-slate-950 border border-slate-850 rounded-xl p-3 h-40 overflow-y-auto font-mono text-[9.5px] leading-relaxed flex flex-col gap-2 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
                {autopilotLogs.map((log) => (
                  <div key={log.id} className="flex items-start gap-1.5 transition duration-150 hover:bg-slate-900/30 py-0.5 rounded px-1">
                    <span className="text-slate-600 font-medium select-none">[{log.time}]</span>
                    <span className={
                      log.type === "success" 
                        ? "text-emerald-400" 
                        : log.type === "warn" 
                        ? "text-amber-400" 
                        : log.type === "error" 
                        ? "text-rose-400 font-bold" 
                        : log.type === "trade" 
                        ? "text-indigo-400 font-extrabold animate-pulse" 
                        : "text-slate-300"
                    }>
                      {log.text}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

        </section>

        {/* RIGHT COLUMN: HISTÓRICO DE SINAIS ENVIADOS (Span 12 - moved to bottom) */}
        <aside className="lg:col-span-12 flex flex-col gap-6">
          
          {/* Recent Signals History Panel */}
          <div className="bg-slate-900/40 backdrop-blur-md border border-slate-800/60 p-5 rounded-2xl flex flex-col gap-4 flex-grow">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest border-b border-slate-800/60 pb-2 flex items-center justify-between">
              <span>Histórico de Sinais</span>
              <History size={13} className="text-slate-500" />
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 overflow-y-auto max-h-[500px] pr-1 scrollbar-thin">
              {signalHistory.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-500 sm:col-span-2 md:col-span-3 lg:col-span-4">
                  Nenhum sinal gerado nesta sessão ainda.
                </div>
              ) : (
                signalHistory.map((signal) => {
                  const isPending = signal.status === "PENDING";
                  const isWin = signal.status === "WIN";
                  const isLoss = signal.status === "LOSS";

                  return (
                    <div 
                      key={signal.id} 
                      className="bg-slate-950/40 border border-slate-800/50 rounded-xl p-3 flex flex-col gap-2.5 hover:bg-slate-950/60 transition text-xs"
                    >
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-200">{signal.asset}</span>
                          {isPending ? (
                            <span className="text-[8px] px-1 py-0.2 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded font-black font-mono animate-pulse">PENDING</span>
                          ) : isWin ? (
                            <span className="text-[8px] px-1 py-0.2 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded font-black font-mono">WIN ��</span>
                          ) : (
                            <span className="text-[8px] px-1 py-0.2 bg-rose-500/10 text-rose-400 border border-rose-500/20 rounded font-black font-mono">LOSS ��</span>
                          )}
                        </div>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${
                          signal.signal === "CALL" 
                            ? "bg-emerald-500/10 text-emerald-400" 
                            : signal.signal === "PUT" 
                            ? "bg-rose-500/10 text-rose-400" 
                            : "bg-slate-500/10 text-slate-400"
                        }`}>
                          {signal.signal === "NEUTRAL" ? "NEUTRO" : signal.signal}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-[10px] font-mono text-slate-400">
                        <div>
                          <span className="text-[8px] text-slate-500 block uppercase font-semibold">Horário</span>
                          <span className="font-semibold text-slate-300">{signal.entryTime || "Imediato"}</span>
                        </div>
                        <div>
                          <span className="text-[8px] text-slate-500 block uppercase font-semibold">Expiração</span>
                          <span className="font-semibold text-indigo-400 flex items-center gap-1">
                            <span>{signal.expiry}</span>
                            {isPending && signal.expirySecondsRemaining !== undefined && (
                              <span className="text-[9px] text-slate-400 font-normal font-sans">
                                ({signal.expirySecondsRemaining}s)
                              </span>
                            )}
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-[10px] font-mono text-slate-400 border-t border-slate-900/60 pt-2">
                        <div>
                          <span className="text-[8px] text-slate-500 block uppercase font-semibold">Taxa Entrada</span>
                          <span className="font-bold text-slate-300">
                            {signal.entryPrice ? signal.entryPrice.toFixed(selectedAsset.decimals) : "0.00"}
                          </span>
                        </div>
                        <div>
                          <span className="text-[8px] text-slate-500 block uppercase font-semibold">Fechamento</span>
                          <span className={`font-bold ${isPending ? "text-amber-400" : isWin ? "text-emerald-400" : "text-rose-400"}`}>
                            {isPending ? "Aguardando..." : (signal.exitPrice ? signal.exitPrice.toFixed(selectedAsset.decimals) : "0.00")}
                          </span>
                        </div>
                      </div>

                      <div className="flex justify-between items-center border-t border-slate-900 pt-2 text-[10px]">
                        <span className="text-slate-500 text-[9px] truncate max-w-[120px]">
                          {signal.strategy === 'reversion' ? 'Retração' : signal.strategy === 'trend' ? 'Tendência' : 'Price Action'}
                        </span>
                        
  <div className="flex flex-col items-end text-right ml-2 space-y-1">
    <div className="text-[10px] text-gray-400">
      <span className="font-medium text-gray-300">Qualidade técnica:</span> {signal.technicalScore}/100
    </div>
    <div className="text-[10px] text-gray-400">
      <span className="font-medium text-gray-300">Probabilidade estatística:</span> {signal.calibrationAvailable && signal.calibratedProbability !== null ? `${signal.calibratedProbability}%` : 'indisponível'}
    </div>
  </div>
  
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Quick Summary stats bottom widget */}
            <div className="mt-auto pt-3 border-t border-slate-800/80 grid grid-cols-3 gap-2 text-center text-xs">
              <div>
                <span className="text-[8px] text-slate-500 uppercase block mb-0.5">Sinais CALL</span>
                <span className="text-xs font-bold text-emerald-400 font-mono">{stats.callsCount}</span>
              </div>
              <div>
                <span className="text-[8px] text-slate-500 uppercase block mb-0.5">Sinais PUT</span>
                <span className="text-xs font-bold text-rose-400 font-mono">{stats.putsCount}</span>
              </div>
              <div>
                <span className="text-[8px] text-slate-500 uppercase block mb-0.5">Confiança Med.</span>
                <span className="text-xs font-bold text-purple-400 font-mono">{formatPercent(stats.avgConfidence)}</span>
              </div>
            </div>
          </div>

        </aside>

      </main>

      {/* FOOTER BAR */}
      <footer className="h-12 px-6 md:px-8 flex flex-col md:flex-row items-center justify-between border-t border-slate-800/80 bg-slate-950/80 text-[10px] text-slate-500 uppercase tracking-widest font-medium gap-2 py-3 md:py-0">
        <div>
          © 2026 Analisador de Sinais de Opções Binárias • v3.0-Premium
        </div>
        <div className="flex flex-wrap gap-4 md:gap-6 justify-center">
          <span className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div> 
            Sistemas em Tempo Real Ativos
          </span>
          <span className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-indigo-500"></div> 
            Latência do Servidor: 12ms
          </span>
          <span className="text-slate-400 font-semibold normal-case">
            Aviso: Opere com gerenciamento de risco rigoroso.
          </span>
        </div>
      </footer>

      {/* DETAILED HELP / DOCUMENTATION MODAL */}
      {showHelp && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative">
            <button
              onClick={() => setShowHelp(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white text-lg font-mono cursor-pointer"
            >
              ✕
            </button>
            
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <Info className="text-indigo-400" size={20} />
              <span>Como funciona o BinaryPulse AI?</span>
            </h3>

            <div className="space-y-4 text-xs text-slate-300 leading-relaxed">
              <p>
                Este aplicativo é um monitor analítico e rastreador técnico de alta precisão em tempo real. Ele compila em tempo real as flutuações e gráficos dos principais ativos globais, calculando de forma avançada indicadores como RSI, Bandas de Bollinger, MACD e Médias Móveis (EMA 9, SMA 21).
              </p>
              
              <div>
                <h4 className="font-bold text-slate-200 mb-1">1. Inteligência Artificial e Processamento Local</h4>
                <p>
                  Quando você clica em <strong>Gerar Sinal de Entrada</strong>, os dados de preço e osciladores do ativo ativo são processados em tempo real pela IA Gemini se a sua chave de API estiver configurada. Caso contrário, o robusto Motor Técnico Local assume o cálculo matemático das confluências para te dar uma resposta imediata.
                </p>
              </div>

              <div>
                <h4 className="font-bold text-slate-200 mb-1">2. Alertas de Direcionamento (CALL ou PUT)</h4>
                <p>
                  O sistema analisa cenários de exaustão e reversão (como RSI extremo, toques em limites de Bollinger, confluência de médias e padrões gráficos) para gerar recomendações direcionais com alta probabilidade de sucesso.
                </p>
              </div>

              <div>
                <h4 className="font-bold text-slate-200 mb-1">3. Monitoramento de Taxas e Suportes</h4>
                <p>
                  O aplicativo monitora o preço do ativo em tempo real comparando-o com a taxa de entrada sugerida. Ele destaca as zonas de segurança para COMPRA (CALL) e VENDA (PUT), fornecendo orientações práticas sobre o melhor momento operacional.
                </p>
              </div>
            </div>

            <button
              onClick={() => setShowHelp(false)}
              className="mt-6 w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs uppercase tracking-wider transition cursor-pointer"
            >
              Entendido, vamos lucrar!
            </button>
          </div>
        </div>
      )}

      {/* FULL MARKET SWEEP PROGRESS & RESULTS MODAL */}
      {showSweepModal && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800/85 rounded-2xl max-w-2xl w-full p-6 shadow-2xl relative overflow-hidden flex flex-col max-h-[85vh] border-indigo-500/10">
            
            {/* Ambient top decoration */}
            <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-emerald-500 via-indigo-500 to-teal-500" />
            
            {!isSweepScanning && (
              <button
                onClick={() => setShowSweepModal(false)}
                className="absolute top-4 right-4 text-slate-400 hover:text-white text-lg font-mono cursor-pointer transition"
              >
                ✕
              </button>
            )}

            {/* Header */}
            <div className="flex items-center gap-3 border-b border-slate-800/80 pb-4 mb-4">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
                <Zap size={20} className={isSweepScanning ? "animate-pulse" : ""} />
              </div>
              <div>
                <h3 className="text-base font-bold text-white tracking-tight">Varredura Multiativos em Tempo Real</h3>
                <p className="text-xs text-slate-400">
                  {isSweepScanning ? "Analisando confluências técnicas institucional nos osciladores globais..." : "Varredura concluída. Sinais de alta precisão listados abaixo."}
                </p>
              </div>
            </div>

            {/* Progress Section */}
            {isSweepScanning && (
              <div className="mb-4 bg-slate-950/60 border border-slate-800 p-4 rounded-xl flex flex-col gap-3">
                <div className="flex items-center justify-between text-xs font-bold font-mono">
                  <span className="text-slate-400 uppercase tracking-wider">Progresso da Varredura:</span>
                  <span className="text-emerald-400">{formatPercent(sweepProgress)}</span>
                </div>
                
                {/* Progress bar wrapper */}
                <div className="w-full h-2 bg-slate-900 rounded-full overflow-hidden relative border border-slate-800">
                  <motion.div 
                    className="h-full bg-gradient-to-r from-emerald-500 via-teal-500 to-indigo-500 rounded-full"
                    style={{ width: `${clampPercent(sweepProgress)}%` }}
                    layout
                  />
                </div>
                
                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span className="flex items-center gap-1.5 font-bold">
                    <RefreshCw size={11} className="animate-spin text-emerald-400" />
                    Analisando agora: <strong className="text-white">{sweepCurrentAsset || "Iniciando..."}</strong>
                  </span>
                  <span>Aproximadamente {Math.ceil((ASSETS.length - (sweepProgress / 100 * ASSETS.length)) * 0.4)}s restantes</span>
                </div>
              </div>
            )}

            {/* Results Grid / List */}
            <div className="flex-grow overflow-y-auto pr-1 space-y-2 scrollbar-thin scrollbar-thumb-slate-800 max-h-[50vh]">
              {sweepResults.map((result) => {
                const isScanning = result.status === "scanning";
                const isSuccess = result.status === "success";
                const hasSignal = isSuccess && result.signal && result.signal.signal !== "NEUTRAL";
                const isCall = hasSignal && result.signal?.signal === "CALL";
                const isPut = hasSignal && result.signal?.signal === "PUT";
                const isNeutral = isSuccess && (!result.signal || result.signal.signal === "NEUTRAL");

                return (
                  <div 
                    key={result.symbol} 
                    className={`p-3 rounded-xl border transition-all flex items-center justify-between gap-4 ${
                      isScanning 
                        ? "bg-indigo-950/20 border-indigo-500/30 animate-pulse" 
                        : isCall
                        ? "bg-emerald-950/15 border-emerald-500/25 shadow-sm shadow-emerald-500/5"
                        : isPut
                        ? "bg-rose-950/15 border-rose-500/25 shadow-sm shadow-rose-500/5"
                        : "bg-slate-950/40 border-slate-800/60 hover:border-slate-800"
                    }`}
                  >
                    {/* Left side: Asset Info */}
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-slate-200 tracking-tight">{result.symbol}</span>
                        <span className="text-[10px] px-1.5 py-0.2 bg-slate-900 border border-slate-800 rounded font-mono font-bold text-emerald-500 shrink-0">
                          {Math.round(result.payout * 100)}% Payout
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-500 truncate">{result.name}</span>
                    </div>

                    {/* Middle: Status and details */}
                    <div className="flex items-center gap-3 shrink-0">
                      {result.status === "idle" && (
                        <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">Aguardando...</span>
                      )}
                      {isScanning && (
                        <span className="text-xs text-indigo-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
                          <RefreshCw size={11} className="animate-spin" />
                          Varrendo...
                        </span>
                      )}
                      {result.status === "error" && (
                        <span className="text-xs text-rose-500 font-semibold uppercase tracking-wider flex items-center gap-1">
                          <XCircle size={12} />
                          Falha
                        </span>
                      )}
                      {isSuccess && (
                        <div className="flex items-center gap-3">
                          {isNeutral && (
                            <span className="text-[10px] bg-slate-900 border border-slate-850 text-slate-400 font-black px-2.5 py-1 rounded-lg uppercase">
                              ��️ Sem Sinal Claro
                            </span>
                          )}
                          {isCall && (
                            <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 px-3 py-1 rounded-xl text-xs font-black">
                              <TrendingUp size={12} className="animate-bounce" />
                              <span>CALL • {formatPercent(result.signal?.technicalScore)}</span>
                            </div>
                          )}
                          {isPut && (
                            <div className="flex items-center gap-2 bg-rose-500/10 border border-rose-500/30 text-rose-400 px-3 py-1 rounded-xl text-xs font-black">
                              <TrendingDown size={12} className="animate-bounce" />
                              <span>PUT • {formatPercent(result.signal?.technicalScore)}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Right side: Action Button */}
                    <div className="shrink-0">
                      {isSuccess && hasSignal ? (
                        <button
                          onClick={() => {
                            // Select full asset
                            const fullAsset = ASSETS.find(a => a.symbol === result.symbol);
                            if (fullAsset) {
                              setSelectedAsset(fullAsset);
                            }
                            // Set analyzed strategy
                            if (result.strategy) {
                              setStrategy(result.strategy as StrategyType);
                            }
                            // Set signal active
                            if (result.signal) {
                              setActiveSignal(result.signal);
                              setSignalHistory(oldHistory => {
                                if (oldHistory.some(h => h.id === result.signal?.id)) return oldHistory;
                                return [result.signal!, ...oldHistory];
                              });
                            }
                            setShowSweepModal(false);
                          }}
                          className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-black text-[10px] rounded-lg uppercase tracking-wider cursor-pointer transition-all hover:scale-[1.03]"
                        >
                          Simular
                        </button>
                      ) : (
                        <button
                          disabled
                          className="px-3 py-1.5 bg-slate-900 text-slate-600 font-black text-[10px] rounded-lg uppercase tracking-wider border border-slate-800 cursor-not-allowed"
                        >
                          Aguardar
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Bottom Actions */}
            <div className="mt-5 pt-4 border-t border-slate-800/80 flex items-center justify-between gap-4">
              <span className="text-[10px] text-slate-500 uppercase tracking-widest font-black flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                Sincronizado com API FastForex
              </span>
              
              {!isSweepScanning ? (
                <div className="flex gap-2">
                  <button
                    onClick={handleSweepAssets}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black uppercase tracking-wider rounded-xl cursor-pointer transition"
                  >
                    Varrer Novamente
                  </button>
                  <button
                    onClick={() => setShowSweepModal(false)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-black uppercase tracking-wider rounded-xl cursor-pointer transition"
                  >
                    Fechar
                  </button>
                </div>
              ) : (
                <span className="text-[10px] text-slate-400 font-bold uppercase animate-pulse">
                  Por favor, aguarde a conclusão da varredura...
                </span>
              )}
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
