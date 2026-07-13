import React, { useState, useMemo } from "react";
import { Candle } from "../types";

interface TradingChartProps {
  candles: Candle[];
  supportLevel?: number;
  resistanceLevel?: number;
  currentPrice: number;
  autoPilotActive?: boolean;
  isScanning?: boolean;
}

export default function TradingChart({
  candles,
  supportLevel,
  resistanceLevel,
  currentPrice,
  autoPilotActive = false,
  isScanning = false,
}: TradingChartProps) {
  const [hoveredCandle, setHoveredCandle] = useState<{ candle: Candle; index: number } | null>(null);
  const [chartWidth, setChartWidth] = useState(800);

  // SVG Chart Height parameters
  const mainHeight = 240;
  const rsiHeight = 70;
  const macdHeight = 70;
  const gap = 15;
  const totalHeight = mainHeight + rsiHeight + macdHeight + gap * 2;

  // Use ResizeObserver or a clean inline ref resize technique to stay responsive
  const containerRef = React.useCallback((node: HTMLDivElement | null) => {
    if (node !== null) {
      setChartWidth(node.getBoundingClientRect().width || 800);
      const resizeObserver = new ResizeObserver((entries) => {
        for (let entry of entries) {
          setChartWidth(entry.contentRect.width || 800);
        }
      });
      resizeObserver.observe(node);
      return () => resizeObserver.disconnect();
    }
  }, []);

  // Determine min and max prices for mapping Y coordinates (Main Chart)
  const priceRange = useMemo(() => {
    if (candles.length === 0) return { min: 0, max: 100 };
    let min = Infinity;
    let max = -Infinity;

    candles.forEach((c) => {
      // Check candle high/low
      if (c.low < min) min = c.low;
      if (c.high > max) max = c.high;

      // Check Bollinger Bands
      if (c.bollinger) {
        if (c.bollinger.lower < min) min = c.bollinger.lower;
        if (c.bollinger.upper > max) max = c.bollinger.upper;
      }

      // Check Moving Averages
      if (c.ema9 && c.ema9 < min) min = c.ema9;
      if (c.ema9 && c.ema9 > max) max = c.ema9;
      if (c.sma21 && c.sma21 < min) min = c.sma21;
      if (c.sma21 && c.sma21 > max) max = c.sma21;
    });

    // Fit custom levels if provided
    if (supportLevel && supportLevel < min) min = supportLevel;
    if (resistanceLevel && resistanceLevel > max) max = resistanceLevel;

    // Add 10% padding
    const padding = (max - min) * 0.1 || 0.001;
    return { min: min - padding, max: max + padding };
  }, [candles, supportLevel, resistanceLevel]);

  // Determine MACD range
  const macdRange = useMemo(() => {
    if (candles.length === 0) return { min: -1, max: 1 };
    let min = -0.0001;
    let max = 0.0001;
    candles.forEach((c) => {
      if (c.macd) {
        if (c.macd.line < min) min = c.macd.line;
        if (c.macd.line > max) max = c.macd.line;
        if (c.macd.signal < min) min = c.macd.signal;
        if (c.macd.signal > max) max = c.macd.signal;
        if (c.macd.histogram < min) min = c.macd.histogram;
        if (c.macd.histogram > max) max = c.macd.histogram;
      }
    });
    const padding = (max - min) * 0.1 || 0.00001;
    return { min: min - padding, max: max + padding };
  }, [candles]);

  const candleCount = candles.length;
  const paddingRight = 65; // Area for price values on the right
  const drawWidth = chartWidth - paddingRight;

  // Helper functions to convert Values to Y coordinates
  const priceToY = (price: number) => {
    const { min, max } = priceRange;
    return mainHeight - ((price - min) / (max - min)) * mainHeight;
  };

  const rsiToY = (rsiVal: number) => {
    const rsiMin = 0;
    const rsiMax = 100;
    const rsiTop = mainHeight + gap;
    return rsiTop + rsiHeight - ((rsiVal - rsiMin) / (rsiMax - rsiMin)) * rsiHeight;
  };

  const macdToY = (macdVal: number) => {
    const { min, max } = macdRange;
    const macdTop = mainHeight + rsiHeight + gap * 2;
    return macdTop + macdHeight - ((macdVal - min) / (max - min)) * macdHeight;
  };

  // Convert index to X coordinate
  const indexToX = (index: number) => {
    if (candleCount <= 1) return 0;
    return (index / (candleCount - 1)) * (drawWidth - 20) + 10;
  };

  // Coordinates mapping
  const points = useMemo(() => {
    return candles.map((c, i) => {
      const x = indexToX(i);
      return {
        x,
        openY: priceToY(c.open),
        closeY: priceToY(c.close),
        highY: priceToY(c.high),
        lowY: priceToY(c.low),
        ema9Y: c.ema9 ? priceToY(c.ema9) : null,
        sma21Y: c.sma21 ? priceToY(c.sma21) : null,
        bbUpperY: c.bollinger ? priceToY(c.bollinger.upper) : null,
        bbMiddleY: c.bollinger ? priceToY(c.bollinger.middle) : null,
        bbLowerY: c.bollinger ? priceToY(c.bollinger.lower) : null,
        rsiY: c.rsi ? rsiToY(c.rsi) : null,
        macdLineY: c.macd ? macdToY(c.macd.line) : null,
        macdSignalY: c.macd ? macdToY(c.macd.signal) : null,
        macdHistY: c.macd ? macdToY(c.macd.histogram) : null,
        candle: c,
        index: i,
      };
    });
  }, [candles, priceRange, macdRange, chartWidth]);

  // Construct Path Strings for Indicator Lines
  const ema9Path = useMemo(() => {
    return points
      .filter((p) => p.ema9Y !== null)
      .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.ema9Y}`)
      .join(" ");
  }, [points]);

  const sma21Path = useMemo(() => {
    return points
      .filter((p) => p.sma21Y !== null)
      .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.sma21Y}`)
      .join(" ");
  }, [points]);

  const bbUpperPath = useMemo(() => {
    return points
      .filter((p) => p.bbUpperY !== null)
      .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.bbUpperY}`)
      .join(" ");
  }, [points]);

  const bbLowerPath = useMemo(() => {
    return points
      .filter((p) => p.bbLowerY !== null)
      .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.bbLowerY}`)
      .join(" ");
  }, [points]);

  // Bollinger Bands shaded area
  const bbAreaPath = useMemo(() => {
    const upperPoints = points.filter((p) => p.bbUpperY !== null);
    const lowerPoints = points.filter((p) => p.bbLowerY !== null).reverse();
    if (upperPoints.length === 0 || lowerPoints.length === 0) return "";

    const pathStart = `M ${upperPoints[0].x} ${upperPoints[0].bbUpperY}`;
    const pathUpper = upperPoints.map((p) => `L ${p.x} ${p.bbUpperY}`).join(" ");
    const pathLower = lowerPoints.map((p) => `L ${p.x} ${p.bbLowerY}`).join(" ");

    return `${pathStart} ${pathUpper} ${pathLower} Z`;
  }, [points]);

  const rsiPath = useMemo(() => {
    return points
      .filter((p) => p.rsiY !== null)
      .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.rsiY}`)
      .join(" ");
  }, [points]);

  const macdLinePath = useMemo(() => {
    return points
      .filter((p) => p.macdLineY !== null)
      .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.macdLineY}`)
      .join(" ");
  }, [points]);

  const macdSignalPath = useMemo(() => {
    return points
      .filter((p) => p.macdSignalY !== null)
      .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.macdSignalY}`)
      .join(" ");
  }, [points]);

  // Handle Mouse Hover Interactions
  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (x < 10 || x > drawWidth) {
      setHoveredCandle(null);
      return;
    }

    // Find the closest point index
    let closestIndex = 0;
    let minDistance = Infinity;

    points.forEach((p, idx) => {
      const distance = Math.abs(p.x - x);
      if (distance < minDistance) {
        minDistance = distance;
        closestIndex = idx;
      }
    });

    if (closestIndex >= 0 && closestIndex < candles.length) {
      setHoveredCandle({
        candle: candles[closestIndex],
        index: closestIndex,
      });
    }
  };

  const activeCandle = hoveredCandle ? hoveredCandle.candle : candles[candles.length - 1];

  return (
    <div className="w-full bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-xl flex flex-col">
      {/* HUD Bar - Candle detailed telemetry */}
      <div className="flex flex-wrap items-center justify-between text-xs font-mono text-slate-400 border-b border-slate-800 pb-3 mb-3 gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-slate-200 font-semibold bg-slate-800 px-2 py-0.5 rounded">
            {hoveredCandle ? "CANDLE HISTÓRICO" : "CANDLE ATUAL (TEMPO REAL)"}
          </span>
          {activeCandle && (
            <>
              <span>A: <strong className="text-slate-200">{activeCandle.open.toFixed(5)}</strong></span>
              <span>M: <strong className="text-emerald-400">{activeCandle.high.toFixed(5)}</strong></span>
              <span>Mí: <strong className="text-rose-400">{activeCandle.low.toFixed(5)}</strong></span>
              <span>F: <strong className={`${activeCandle.close >= activeCandle.open ? "text-emerald-400" : "text-rose-400"}`}>{activeCandle.close.toFixed(5)}</strong></span>
              <span className={`font-semibold ${activeCandle.close >= activeCandle.open ? "text-emerald-400" : "text-rose-400"}`}>
                {(activeCandle.close - activeCandle.open) >= 0 ? "+" : ""}{(activeCandle.close - activeCandle.open).toFixed(5)}
              </span>
            </>
          )}
        </div>
        {activeCandle && (
          <div className="flex items-center gap-4 text-[11px] text-slate-500">
            <span>RSI: <strong className="text-purple-400">{activeCandle.rsi?.toFixed(2) || "50.00"}</strong></span>
            <span>MACD Hist: <strong className={activeCandle.macd && activeCandle.macd.histogram >= 0 ? "text-emerald-400" : "text-rose-400"}>{activeCandle.macd?.histogram.toFixed(5) || "0.00"}</strong></span>
          </div>
        )}
      </div>

      {/* SVG Canvas */}
      <div ref={containerRef} className="w-full flex-grow relative select-none cursor-crosshair">
        <svg
          width={chartWidth}
          height={totalHeight}
          className="overflow-visible"
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoveredCandle(null)}
        >
          {/* Animated Laser Scan Line */}
          {autoPilotActive && (
            <g>
              <defs>
                <linearGradient id="laser-grad-blue" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="rgba(99, 102, 241, 0)" />
                  <stop offset="50%" stopColor={isScanning ? "rgba(16, 185, 129, 0.45)" : "rgba(99, 102, 241, 0.35)"} />
                  <stop offset="100%" stopColor="rgba(99, 102, 241, 0)" />
                </linearGradient>
              </defs>
              <rect
                x="10"
                width={drawWidth - 10}
                height="22"
                fill="url(#laser-grad-blue)"
                style={{
                  animation: isScanning ? "scan-sweep-fast 1.5s ease-in-out infinite" : "scan-sweep-slow 5s ease-in-out infinite",
                  pointerEvents: "none"
                }}
              />
              <style>{`
                @keyframes scan-sweep-slow {
                  0% { transform: translateY(0px); }
                  50% { transform: translateY(${mainHeight - 22}px); }
                  100% { transform: translateY(0px); }
                }
                @keyframes scan-sweep-fast {
                  0% { transform: translateY(0px); }
                  50% { transform: translateY(${mainHeight - 22}px); }
                  100% { transform: translateY(0px); }
                }
              `}</style>
            </g>
          )}

          {/* Main Chart background Grid Lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => {
            const y = ratio * mainHeight;
            const priceVal = priceRange.max - ratio * (priceRange.max - priceRange.min);
            return (
              <g key={`grid-${i}`}>
                <line
                  x1="10"
                  y1={y}
                  x2={drawWidth}
                  y2={y}
                  stroke="#1e293b"
                  strokeWidth="1"
                  strokeDasharray="2,2"
                />
                <text
                  x={drawWidth + 8}
                  y={y + 4}
                  fill="#94a3b8"
                  fontSize="9"
                  fontFamily="monospace"
                  textAnchor="start"
                >
                  {priceVal.toFixed(5)}
                </text>
              </g>
            );
          })}

          {/* Bollinger Bands Shaded Area */}
          {bbAreaPath && (
            <path
              d={bbAreaPath}
              fill="rgba(59, 130, 246, 0.05)"
              stroke="none"
            />
          )}

          {/* Bollinger Upper and Lower Bounds */}
          {bbUpperPath && (
            <path
              d={bbUpperPath}
              fill="none"
              stroke="#3b82f6"
              strokeWidth="0.8"
              strokeDasharray="4,4"
              opacity="0.6"
            />
          )}
          {bbLowerPath && (
            <path
              d={bbLowerPath}
              fill="none"
              stroke="#3b82f6"
              strokeWidth="0.8"
              strokeDasharray="4,4"
              opacity="0.6"
            />
          )}

          {/* EMA 9 Line */}
          {ema9Path && (
            <path
              d={ema9Path}
              fill="none"
              stroke="#10b981"
              strokeWidth="1.2"
              opacity="0.9"
            />
          )}

          {/* SMA 21 Line */}
          {sma21Path && (
            <path
              d={sma21Path}
              fill="none"
              stroke="#f59e0b"
              strokeWidth="1.2"
              opacity="0.9"
            />
          )}

          {/* Key Support and Resistance Horizontal Levels */}
          {resistanceLevel && (
            <g>
              <line
                x1="10"
                y1={priceToY(resistanceLevel)}
                x2={drawWidth}
                y2={priceToY(resistanceLevel)}
                stroke="#ef4444"
                strokeWidth="1.5"
                strokeDasharray="5,5"
                opacity="0.85"
              />
              <rect
                x={drawWidth - 110}
                y={priceToY(resistanceLevel) - 18}
                width="105"
                height="15"
                rx="3"
                fill="#7f1d1d"
                opacity="0.9"
              />
              <text
                x={drawWidth - 105}
                y={priceToY(resistanceLevel) - 7}
                fill="#fca5a5"
                fontSize="8"
                fontFamily="monospace"
                fontWeight="bold"
              >
                RESISTÊNCIA IA: {resistanceLevel.toFixed(5)}
              </text>
            </g>
          )}

          {/* Key Support Level */}
          {supportLevel && (
            <g>
              <line
                x1="10"
                y1={priceToY(supportLevel)}
                x2={drawWidth}
                y2={priceToY(supportLevel)}
                stroke="#10b981"
                strokeWidth="1.5"
                strokeDasharray="5,5"
                opacity="0.85"
              />
              <rect
                x={drawWidth - 110}
                y={priceToY(supportLevel) + 3}
                width="105"
                height="15"
                rx="3"
                fill="#064e3b"
                opacity="0.9"
              />
              <text
                x={drawWidth - 105}
                y={priceToY(supportLevel) + 14}
                fill="#a7f3d0"
                fontSize="8"
                fontFamily="monospace"
                fontWeight="bold"
              >
                SUPORTE IA: {supportLevel.toFixed(5)}
              </text>
            </g>
          )}

          {/* Candlesticks Drawing */}
          {points.map((p, idx) => {
            const isGreen = p.candle.close >= p.candle.open;
            const strokeColor = isGreen ? "#10b981" : "#ef4444";
            const fillColor = isGreen ? "#10b981" : "#ef4444";
            const candleWidth = Math.max(1.5, Math.min(15, (drawWidth / candleCount) * 0.6));

            return (
              <g key={`candle-${idx}`} className="transition-all duration-300">
                {/* Wick */}
                <line
                  x1={p.x}
                  y1={p.highY}
                  x2={p.x}
                  y2={p.lowY}
                  stroke={strokeColor}
                  strokeWidth="1.5"
                />
                {/* Body */}
                <rect
                  x={p.x - candleWidth / 2}
                  y={Math.min(p.openY, p.closeY)}
                  width={candleWidth}
                  height={Math.max(1.5, Math.abs(p.closeY - p.openY))}
                  fill={fillColor}
                  stroke={strokeColor}
                  strokeWidth="0.5"
                  rx="1"
                />
              </g>
            );
          })}

          {/* Current Live Price Level Tracker */}
          <g>
            <line
              x1="10"
              y1={priceToY(currentPrice)}
              x2={drawWidth}
              y2={priceToY(currentPrice)}
              stroke="#6366f1"
              strokeWidth="1"
              strokeDasharray="2,1"
            />
            {/* Pulsing indicator at price level */}
            <circle
              cx={drawWidth}
              cy={priceToY(currentPrice)}
              r="4"
              fill="#6366f1"
              className="animate-ping"
            />
            <rect
              x={drawWidth + 2}
              y={priceToY(currentPrice) - 8}
              width="60"
              height="16"
              rx="3"
              fill="#4f46e5"
            />
            <text
              x={drawWidth + 7}
              y={priceToY(currentPrice) + 4}
              fill="#ffffff"
              fontSize="9"
              fontFamily="monospace"
              fontWeight="bold"
            >
              {currentPrice.toFixed(5)}
            </text>
          </g>

          {/* --- RSI SUBCHART --- */}
          <g>
            {/* Background */}
            <rect
              x="10"
              y={mainHeight + gap}
              width={drawWidth - 10}
              height={rsiHeight}
              fill="rgba(15, 23, 42, 0.4)"
              stroke="#1e293b"
              strokeWidth="1"
              rx="4"
            />
            {/* Overbought limit (70) */}
            <line
              x1="10"
              y1={rsiToY(70)}
              x2={drawWidth}
              y2={rsiToY(70)}
              stroke="#ef4444"
              strokeWidth="0.8"
              strokeDasharray="2,2"
              opacity="0.8"
            />
            <text
              x={drawWidth + 8}
              y={rsiToY(70) + 3}
              fill="#ef4444"
              fontSize="8"
              fontFamily="monospace"
            >
              70
            </text>

            {/* Oversold limit (30) */}
            <line
              x1="10"
              y1={rsiToY(30)}
              x2={drawWidth}
              y2={rsiToY(30)}
              stroke="#10b981"
              strokeWidth="0.8"
              strokeDasharray="2,2"
              opacity="0.8"
            />
            <text
              x={drawWidth + 8}
              y={rsiToY(30) + 3}
              fill="#10b981"
              fontSize="8"
              fontFamily="monospace"
            >
              30
            </text>

            {/* Center Line (50) */}
            <line
              x1="10"
              y1={rsiToY(50)}
              x2={drawWidth}
              y2={rsiToY(50)}
              stroke="#334155"
              strokeWidth="0.5"
            />

            {/* RSI Path line */}
            {rsiPath && (
              <path
                d={rsiPath}
                fill="none"
                stroke="#c084fc"
                strokeWidth="1.2"
              />
            )}
            <text
              x="18"
              y={mainHeight + gap + 15}
              fill="#94a3b8"
              fontSize="9"
              fontFamily="monospace"
              fontWeight="bold"
            >
              RSI (14)
            </text>
          </g>

          {/* --- MACD SUBCHART --- */}
          <g>
            <rect
              x="10"
              y={mainHeight + rsiHeight + gap * 2}
              width={drawWidth - 10}
              height={macdHeight}
              fill="rgba(15, 23, 42, 0.4)"
              stroke="#1e293b"
              strokeWidth="1"
              rx="4"
            />

            {/* MACD Zero Line */}
            <line
              x1="10"
              y1={macdToY(0)}
              x2={drawWidth}
              y2={macdToY(0)}
              stroke="#334155"
              strokeWidth="1"
            />

            {/* MACD Histograms */}
            {points.map((p, idx) => {
              if (p.macdHistY === null) return null;
              const zeroY = macdToY(0);
              const height = Math.abs(p.macdHistY - zeroY);
              const isPositive = p.macdHistY <= zeroY;
              const barFill = isPositive ? "rgba(16, 185, 129, 0.6)" : "rgba(239, 68, 68, 0.6)";
              const barWidth = Math.max(1, (drawWidth / candleCount) * 0.4);

              return (
                <rect
                  key={`macd-hist-${idx}`}
                  x={p.x - barWidth / 2}
                  y={isPositive ? p.macdHistY : zeroY}
                  width={barWidth}
                  height={Math.max(0.5, height)}
                  fill={barFill}
                />
              );
            })}

            {/* MACD Line */}
            {macdLinePath && (
              <path
                d={macdLinePath}
                fill="none"
                stroke="#38bdf8"
                strokeWidth="1.2"
              />
            )}

            {/* MACD Signal Line */}
            {macdSignalPath && (
              <path
                d={macdSignalPath}
                fill="none"
                stroke="#f43f5e"
                strokeWidth="1"
              />
            )}

            <text
              x="18"
              y={mainHeight + rsiHeight + gap * 2 + 15}
              fill="#94a3b8"
              fontSize="9"
              fontFamily="monospace"
              fontWeight="bold"
            >
              MACD (12, 26, 9)
            </text>
          </g>

          {/* Interactive Hover Crosshair */}
          {hoveredCandle && (
            <g>
              {/* Vertical line */}
              <line
                x1={indexToX(hoveredCandle.index)}
                y1="0"
                x2={indexToX(hoveredCandle.index)}
                y2={totalHeight}
                stroke="rgba(148, 163, 184, 0.3)"
                strokeWidth="1"
                strokeDasharray="3,3"
              />
              {/* Time indicator box on hover vertical axis */}
              <rect
                x={indexToX(hoveredCandle.index) - 30}
                y={totalHeight - 12}
                width="60"
                height="14"
                rx="3"
                fill="#475569"
              />
              <text
                x={indexToX(hoveredCandle.index)}
                y={totalHeight - 2}
                fill="#ffffff"
                fontSize="8"
                fontFamily="monospace"
                textAnchor="middle"
              >
                {hoveredCandle.candle.time}
              </text>
            </g>
          )}
        </svg>
      </div>

      {/* Info Legend */}
      <div className="flex flex-wrap items-center justify-center gap-5 mt-3 pt-3 border-t border-slate-800 text-[10px] font-mono text-slate-500">
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-0.5 bg-[#10b981]" />
          <span>EMA 9 (Rápida)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-0.5 bg-[#f59e0b]" />
          <span>SMA 21 (Lenta)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-2 bg-blue-500 opacity-20 border border-blue-500 border-dashed" />
          <span>Bandas de Bollinger (20, 2)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-0.5 bg-[#c084fc]" />
          <span>RSI (14)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-0.5 bg-[#38bdf8]" />
          <span>MACD Línea</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-0.5 bg-[#f43f5e]" />
          <span>Sinal MACD</span>
        </div>
      </div>
    </div>
  );
}
