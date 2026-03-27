import { useEffect, useLayoutEffect, useMemo, useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { createChart, ColorType, UTCTimestamp } from "lightweight-charts";
import { useAuth } from "./auth/AuthContext";
import { useMarketMode, type SimulationSpeed } from "./market/MarketModeContext";
import ConfirmModal from "./components/ConfirmModal";
import useSmartPolling from "./hooks/useSmartPolling";
import useMarketWebSocket from "./hooks/useMarketWebSocket";

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:4000';
// Trigger redeploy (no-op change)

type OrderStatus = "OPEN" | "PARTIAL" | "FILLED" | "CANCELED";

type Order = {
  id: string;
  type: "buy" | "sell";
  price: number;
  quantity: number;
  status: OrderStatus;
  createdAt?: string;
  originalQuantity?: number;
};

type Trade = {
  id?: string;
  buyOrderId: string;
  sellOrderId: string;
  price: number;
  quantity: number;
  createdAt?: string;
};

type PaperState = {
  balance: number;
  realizedPnL: number;
  positionQty: number;
  avgCost: number;
};

const PAPER_DEFAULT: PaperState = {
  balance: 10000,
  realizedPnL: 0,
  positionQty: 0,
  avgCost: 0,
};

function loadPaperState(key: string | null): PaperState {
  if (!key) return { ...PAPER_DEFAULT };
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return { ...PAPER_DEFAULT };
    const p = JSON.parse(raw) as Record<string, unknown>;
    const realizedPnL =
      typeof p.realizedPnL === "number"
        ? p.realizedPnL
        : typeof p.pnl === "number"
          ? p.pnl
          : PAPER_DEFAULT.realizedPnL;
    const positionQty =
      typeof p.positionQty === "number"
        ? p.positionQty
        : typeof p.position === "number"
          ? p.position
          : PAPER_DEFAULT.positionQty;
    return {
      balance: typeof p.balance === "number" ? p.balance : PAPER_DEFAULT.balance,
      realizedPnL,
      positionQty,
      avgCost: typeof p.avgCost === "number" ? p.avgCost : PAPER_DEFAULT.avgCost,
    };
  } catch {
    return { ...PAPER_DEFAULT };
  }
}

function savePaperState(key: string | null, state: PaperState) {
  if (!key) return;
  try {
    localStorage.setItem(
      key,
      JSON.stringify({
        ...state,
        pnl: state.realizedPnL,
        position: state.positionQty,
      })
    );
  } catch {
    /* ignore */
  }
}

/** Update paper portfolio after a demo order response (best-effort immediate fills). */
function applyPaperAfterDemoOrder(
  form: { type: "buy" | "sell"; price: string; quantity: string },
  orderData: unknown,
  prev: PaperState
): PaperState {
  const price = Number(form.price);
  const quantity = Number(form.quantity);
  if (!Number.isFinite(price) || !Number.isFinite(quantity) || quantity <= 0) return prev;

  const notional = price * quantity;
  const od = orderData as Record<string, unknown> | null | undefined;
  const inner = (od?.order ?? od) as Record<string, unknown> | undefined;
  const status = inner && typeof inner.status === "string" ? inner.status : "";
  if (status === "OPEN" || status === "CANCELED") return prev;

  let { balance, realizedPnL, positionQty, avgCost } = prev;

  if (form.type === "buy") {
    if (balance < notional) return prev;
    const newQty = positionQty + quantity;
    avgCost = newQty > 0 ? (avgCost * positionQty + price * quantity) / newQty : 0;
    positionQty = newQty;
    balance -= notional;
  } else {
    if (positionQty < quantity) return prev;
    const closeQty = Math.min(quantity, positionQty);
    realizedPnL += (price - avgCost) * closeQty;
    balance += notional;
    positionQty -= quantity;
    if (positionQty <= 0) {
      positionQty = 0;
      avgCost = 0;
    }
  }

  return { balance, realizedPnL, positionQty, avgCost };
}

type DevSettingsPanelProps = {
  simulationEnabled: boolean;
  onToggleSimulation: (checked: boolean) => void;
  simulationStarting: boolean;
  simulationStopping: boolean;
  simulationSpeed: SimulationSpeed;
  setSimulationSpeed: (s: SimulationSpeed) => void;
};

/** Authenticated only: simulation + speed (placed below ticker card). */
function DevSettingsPanel({
  simulationEnabled,
  onToggleSimulation,
  simulationStarting,
  simulationStopping,
  simulationSpeed,
  setSimulationSpeed,
}: DevSettingsPanelProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const busy = simulationStarting || simulationStopping;

  return (
    <div ref={ref} style={{ position: "relative", marginBottom: 10 }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          fontSize: 11,
          fontWeight: 500,
          color: "#525d6f",
          background: "transparent",
          border: "none",
          padding: "2px 0",
          cursor: "pointer",
          letterSpacing: 0.2,
        }}
      >
        Dev Settings <span style={{ opacity: 0.65 }}>▾</span>
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            marginTop: 6,
            zIndex: 50,
            minWidth: 200,
            padding: "10px 12px",
            background: "#0f172a",
            border: "1px solid #1f2937",
            borderRadius: 6,
            boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
          }}
        >
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 12,
              color: "#9ca3af",
              cursor: busy ? "not-allowed" : "pointer",
              marginBottom: 10,
            }}
          >
            <input
              type="checkbox"
              checked={simulationEnabled}
              onChange={(e) => onToggleSimulation(e.target.checked)}
              disabled={busy}
              style={{ cursor: busy ? "not-allowed" : "pointer" }}
            />
            <span>Simulate Market</span>
            {simulationStarting && <span style={{ fontSize: 10, color: "#6b7280" }}>Starting…</span>}
            {simulationStopping && <span style={{ fontSize: 10, color: "#6b7280" }}>Stopping…</span>}
          </label>
          <div style={{ fontSize: 10, color: "#525d6f", textTransform: "uppercase", marginBottom: 6 }}>Speed</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={() => {
                setSimulationSpeed("fast");
                setOpen(false);
              }}
              style={{
                flex: 1,
                padding: "6px 8px",
                fontSize: 12,
                borderRadius: 4,
                border: `1px solid ${simulationSpeed === "fast" ? "#3b82f6" : "#374151"}`,
                background: simulationSpeed === "fast" ? "#1e3a5f" : "transparent",
                color: simulationSpeed === "fast" ? "#93c5fd" : "#9ca3af",
                cursor: "pointer",
              }}
            >
              Fast
            </button>
            <button
              type="button"
              onClick={() => {
                setSimulationSpeed("normal");
                setOpen(false);
              }}
              style={{
                flex: 1,
                padding: "6px 8px",
                fontSize: 12,
                borderRadius: 4,
                border: `1px solid ${simulationSpeed === "normal" ? "#3b82f6" : "#374151"}`,
                background: simulationSpeed === "normal" ? "#1e3a5f" : "transparent",
                color: simulationSpeed === "normal" ? "#93c5fd" : "#9ca3af",
                cursor: "pointer",
              }}
            >
              Normal
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** True when fetch failed at the network layer (offline, CORS, wrong host), not HTTP 4xx/5xx. */
function isBrowserNetworkError(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  const m = e.message;
  return (
    m === "Failed to fetch" ||
    m === "NetworkError when attempting to fetch resource." ||
    m === "Load failed"
  );
}

function formatRelativeTime(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  
  const now = Date.now();
  const diffMs = now - d.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  
  if (diffSeconds < 5) return "just now";
  if (diffSeconds < 60) return `${diffSeconds}s ago`;
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return d.toLocaleTimeString();
}

function StatusChip({ status }: { status: OrderStatus }) {
  const styles: Record<OrderStatus, React.CSSProperties> = {
    OPEN: { background: "#1e3a8a", color: "#93c5fd", border: "1px solid #3b82f6" },
    PARTIAL: { background: "#78350f", color: "#fcd34d", border: "1px solid #f59e0b" },
    FILLED: { background: "#065f46", color: "#6ee7b7", border: "1px solid #10b981" },
    CANCELED: { background: "#7f1d1d", color: "#fca5a5", border: "1px solid #ef4444" },
  };

  return (
    <span
      style={{
        fontSize: 11,
        padding: "2px 6px",
        borderRadius: 4,
        fontWeight: 600,
        letterSpacing: 0.3,
        ...styles[status],
      }}
    >
      {status}
    </span>
  );
}

/** Normalize API candle time to UTCTimestamp (unix seconds) for lightweight-charts. */
function normalizeCandleApiTime(raw: unknown): UTCTimestamp {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 0 as UTCTimestamp;
  const sec = n > 1e12 ? Math.floor(n / 1000) : Math.floor(n);
  return sec as UTCTimestamp;
}

/** Ensure strictly increasing time so the chart does not assert on duplicate bars. */
function ensureStrictlyIncreasingCandles<
  T extends { time: UTCTimestamp; open: number; high: number; low: number; close: number; volume: number }
>(rows: T[]): T[] {
  const sorted = [...rows].sort((a, b) => Number(a.time) - Number(b.time));
  for (let i = 1; i < sorted.length; i++) {
    if (Number(sorted[i].time) <= Number(sorted[i - 1].time)) {
      sorted[i] = {
        ...sorted[i],
        time: (Number(sorted[i - 1].time) + 1) as UTCTimestamp,
      };
    }
  }
  return sorted;
}

const CHART_OPTIONS = {
  layout: {
    background: { type: ColorType.Solid as const, color: "#0f172a" },
    textColor: "#9ca3af",
  },
  grid: { vertLines: { color: "#111827" }, horzLines: { color: "#111827" } },
  crosshair: { mode: 1 as const },
  handleScroll: { mouseWheel: true, pressedMouseMove: true },
  handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
  rightPriceScale: { borderColor: "#1f2937", visible: true },
  leftPriceScale: { visible: false },
  timeScale: {
    rightOffset: 10,
    barSpacing: 6,
    lockVisibleTimeRangeOnResize: true,
    borderColor: "#1f2937",
    timeVisible: true,
    secondsVisible: true,
  },
};

/** Candlestick chart: two stacked panels (price + volume), synced time scale, incremental updates, volume tooltip */
function CandlestickChart() {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const priceContainerRef = useRef<HTMLDivElement>(null);
  const volumeContainerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const priceChartRef = useRef<ReturnType<typeof createChart> | null>(null);
  const volumeChartRef = useRef<ReturnType<typeof createChart> | null>(null);
  const volumeByTimeRef = useRef<Map<number, number>>(new Map());
  const initializedRef = useRef(false);
  const syncingRef = useRef(false);
  /** null = chart has data; 'empty' = OK response but no bars; 'error' = request/parse failure */
  const [candleNotice, setCandleNotice] = useState<"empty" | "error" | null>(null);

  useEffect(() => {
    if (!priceContainerRef.current || !volumeContainerRef.current || !wrapperRef.current) return;

    const width = wrapperRef.current.clientWidth;
    const priceChart = createChart(priceContainerRef.current, {
      ...CHART_OPTIONS,
      width,
      height: 320,
    });
    const volumeChart = createChart(volumeContainerRef.current, {
      ...CHART_OPTIONS,
      width,
      height: 120,
      watermark: { visible: false },
    });

    const candleSeries = priceChart.addCandlestickSeries({
      upColor: "#22c55e",
      downColor: "#ef4444",
      borderVisible: false,
      wickUpColor: "#22c55e",
      wickDownColor: "#ef4444",
      priceLineVisible: true,
      lastValueVisible: true,
    });

    const volumeSeries = volumeChart.addHistogramSeries({
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
    });
    volumeChart.priceScale("volume").applyOptions({
      scaleMargins: { top: 0.75, bottom: 0 },
    });

    priceChartRef.current = priceChart;
    volumeChartRef.current = volumeChart;

    function syncPriceToVolume() {
      if (syncingRef.current) return;
      const range = priceChart.timeScale().getVisibleLogicalRange();
      if (range) {
        syncingRef.current = true;
        volumeChart.timeScale().setVisibleLogicalRange(range);
        syncingRef.current = false;
      }
    }
    function syncVolumeToPrice() {
      if (syncingRef.current) return;
      const range = volumeChart.timeScale().getVisibleLogicalRange();
      if (range) {
        syncingRef.current = true;
        priceChart.timeScale().setVisibleLogicalRange(range);
        syncingRef.current = false;
      }
    }
    priceChart.timeScale().subscribeVisibleLogicalRangeChange(syncPriceToVolume);
    volumeChart.timeScale().subscribeVisibleLogicalRangeChange(syncVolumeToPrice);

    if (tooltipRef.current) {
      const tooltipEl = tooltipRef.current;
      priceChart.subscribeCrosshairMove((param) => {
        if (!param.time) {
          tooltipEl.style.display = "none";
          return;
        }
        const t = param.time as number;
        const vol = volumeByTimeRef.current.get(t);
        if (vol !== undefined) {
          tooltipEl.style.display = "block";
          tooltipEl.textContent = `Volume: ${vol}`;
        } else {
          tooltipEl.style.display = "none";
        }
      });
    }

    async function loadCandles() {
      try {
        const res = await fetch(`${API_BASE_URL}/api/market/candles?interval=5`);
        if (!res.ok) {
          console.warn("[CandlestickChart] candles HTTP", res.status, res.statusText);
          setCandleNotice("error");
          return;
        }
        const data = await res.json();
        if (!Array.isArray(data) || !priceChartRef.current || !volumeChartRef.current) {
          setCandleNotice("error");
          return;
        }

        const mapped = data
          .map(
            (c: { time: unknown; open: number; high: number; low: number; close: number; volume?: number }) => ({
              time: normalizeCandleApiTime(c.time),
              open: c.open,
              high: c.high,
              low: c.low,
              close: c.close,
              volume: c.volume ?? 1,
            })
          )
          .filter((c) => Number(c.time) > 0);

        const normalized = ensureStrictlyIncreasingCandles(mapped);

        if (normalized.length === 0) {
          setCandleNotice("empty");
          return;
        }

        setCandleNotice(null);

        const candles = normalized.map((c) => ({
          time: c.time,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
        }));
        const volumes = normalized.map((c) => ({
          time: c.time,
          value: c.volume,
        }));

        volumeByTimeRef.current.clear();
        normalized.forEach((c) => volumeByTimeRef.current.set(c.time as number, c.volume));

        if (!initializedRef.current) {
          candleSeries.setData(candles);
          volumeSeries.setData(volumes);

          priceChart.timeScale().fitContent();

          syncPriceToVolume();

          initializedRef.current = true;
        } else {
          const last = normalized[normalized.length - 1];

          candleSeries.update({ time: last.time, open: last.open, high: last.high, low: last.low, close: last.close });
          volumeSeries.update({ time: last.time, value: last.volume });
        }
      } catch (e) {
        console.error("[CandlestickChart] loadCandles failed", e);
        setCandleNotice("error");
      }
    }

    loadCandles();
    const interval = setInterval(loadCandles, 5000);

    const resizeObserver = new ResizeObserver(() => {
      if (!wrapperRef.current || !priceChartRef.current || !volumeChartRef.current) return;
      const w = wrapperRef.current.clientWidth;
      priceChartRef.current.applyOptions({ width: w });
      volumeChartRef.current.applyOptions({ width: w });
    });
    resizeObserver.observe(wrapperRef.current);

    return () => {
      clearInterval(interval);
      resizeObserver.disconnect();
      priceChart.remove();
      volumeChart.remove();
      priceChartRef.current = null;
      volumeChartRef.current = null;
      initializedRef.current = false;
    };
  }, []);

  return (
    <div ref={wrapperRef} style={{ width: "100%", position: "relative" }}>
      {candleNotice !== null && (
        <div
          style={{
            position: "absolute",
            bottom: 6,
            left: 8,
            right: 8,
            zIndex: 2,
            fontSize: 12,
            color: "#6b7280",
            textAlign: "center",
            pointerEvents: "none",
          }}
        >
          {candleNotice === "empty" ? "Waiting for market activity..." : "Demo data unavailable"}
        </div>
      )}
      <div style={{ position: "relative" }}>
        <div id="price-chart" ref={priceContainerRef} style={{ width: "100%", height: 320 }} />
        <div
          ref={tooltipRef}
          style={{
            display: "none",
            position: "absolute",
            bottom: 8,
            left: 8,
            background: "#111827",
            border: "1px solid #1f2937",
            borderRadius: 4,
            padding: "4px 8px",
            fontSize: 12,
            color: "#9ca3af",
            fontFamily: "monospace",
            pointerEvents: "none",
          }}
        />
      </div>
      <div id="volume-chart" ref={volumeContainerRef} style={{ width: "100%", height: 120 }} />
    </div>
  );
}

// Props interface for view components
interface ViewProps {
  tickerData: { lastPrice: number; change: number; changePercent: number; rollingAvg: number };
  isMobile: boolean;
  err: string | null;
  successMessage: string | null;
  setSuccessMessage: (msg: string | null) => void;
  form: { type: "buy" | "sell"; price: string; quantity: string };
  setForm: (form: { type: "buy" | "sell"; price: string; quantity: string }) => void;
  submitOrder: (e: React.FormEvent) => Promise<void>;
  loading: boolean;
  mobileTab: "book" | "trades" | "history";
  setMobileTab: (tab: "book" | "trades" | "history") => void;
  OrderBookPanel: () => React.ReactElement;
  TradesPanel: () => React.ReactElement;
  HistoryPanel: () => React.ReactElement;
  showOrderForm: boolean;
  onSignInClick: () => void;
  /** Paper portfolio (localStorage); never show 0 until hydrated. */
  balance?: number | null;
  realizedPnL?: number | null;
  positions?: { symbol: string; quantity: number; avgPrice: number }[];
  currentPrice?: number | null;
  /** Live market + signed in: show account, positions, orders, history. */
  tradingEnabled: boolean;
  /** Auth + paper state ready for account row (avoids flashing 0). */
  liveAccountReady?: boolean;
  devSimulation?: {
    enabled: boolean;
    onToggle: (checked: boolean) => void;
    starting: boolean;
    stopping: boolean;
  };
}

function GuestView(props: ViewProps) {
  const {
    tickerData,
    isMobile,
    err,
    successMessage,
    setSuccessMessage,
    form,
    setForm,
    submitOrder,
    loading,
    mobileTab,
    setMobileTab,
    OrderBookPanel,
    TradesPanel,
    HistoryPanel,
    showOrderForm,
    onSignInClick,
    tradingEnabled,
  } = props;

  return (
    <>
      {/* Demo Ticker Bar */}
      <div
        style={{
          background: "#111827",
          border: "1px solid #1f2937",
          borderRadius: 6,
          padding: "8px 12px",
          marginBottom: 10,
          display: "flex",
          alignItems: "center",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: "#f9fafb" }}>$DEMO</span>
          <span
            style={{
              fontSize: 11,
              padding: "2px 6px",
              background: "#1f2937",
              color: "#9ca3af",
              borderRadius: 4,
              fontWeight: 600,
            }}
          >
            SIMULATED
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 2 }}>Last</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: "#e5e7eb", fontFamily: "monospace" }}>
              ${tickerData.lastPrice.toFixed(2)}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 2 }}>Change</div>
            <div
              style={{
                fontSize: 16,
                fontWeight: 600,
                fontFamily: "monospace",
                color: tickerData.change >= 0 ? "#10b981" : "#ef4444",
              }}
            >
              {tickerData.change >= 0 ? "+" : ""}
              {tickerData.change.toFixed(2)} ({tickerData.changePercent >= 0 ? "+" : ""}
              {tickerData.changePercent.toFixed(2)}%)
            </div>
          </div>

          <div>
            <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 2 }}>Rolling Avg (20)</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: "#e5e7eb", fontFamily: "monospace" }}>
              ${tickerData.rollingAvg.toFixed(2)}
            </div>
          </div>
        </div>
      </div>

      <p style={{ fontSize: 12, color: "#6b7280", marginBottom: 10 }}>
        Login to start trading and track a simulated account.
      </p>

      {/* Candlestick Chart */}
      <div
        className="chart-container"
        style={{
          background: "#111827",
          border: "1px solid #1f2937",
          borderRadius: 6,
          padding: 12,
          marginBottom: 10,
          position: "relative",
          width: "100%",
        }}
      >
        <div style={{ marginBottom: 8 }}>
          <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#9ca3af" }}>Price Trend</h3>
        </div>
        <CandlestickChart />
      </div>

      {/* Error Banner */}
      {err && (
        <div
          style={{
            background: "#7f1d1d",
            border: "1px solid #ef4444",
            color: "#fca5a5",
            padding: "8px 12px",
            borderRadius: 6,
            marginBottom: 10,
            fontSize: 13,
          }}
        >
          {err}
        </div>
      )}

      {/* Success Banner */}
      {successMessage && (
        <div
          style={{
            background: "#065f46",
            border: "1px solid #10b981",
            color: "#6ee7b7",
            padding: "8px 12px",
            borderRadius: 6,
            marginBottom: 10,
            fontSize: 13,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>{successMessage}</span>
          <button
            type="button"
            onClick={() => setSuccessMessage(null)}
            style={{
              background: "transparent",
              border: "none",
              color: "#6ee7b7",
              cursor: "pointer",
              fontSize: 18,
              lineHeight: 1,
              padding: 0,
              marginLeft: 12,
            }}
          >
            ×
          </button>
        </div>
      )}

      {/* Order Form - Compact Ticket */}
      {showOrderForm ? (
        <div
          style={{
            background: "#111827",
            border: "1px solid #1f2937",
            borderRadius: 6,
            padding: "10px 12px",
            marginBottom: 10,
          }}
        >
          <form
            onSubmit={submitOrder}
            style={{
              display: "flex",
              gap: 10,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value as "buy" | "sell" })}
              className="input-terminal"
              style={{ minWidth: 80 }}
            >
              <option value="buy">Buy</option>
              <option value="sell">Sell</option>
            </select>

            <input
              type="number"
              placeholder="Price"
              value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value })}
              className="input-terminal"
              required
              min={0}
              step="0.01"
              style={{ width: 120 }}
            />

            <input
              type="number"
              placeholder="Quantity"
              value={form.quantity}
              onChange={(e) => setForm({ ...form, quantity: e.target.value })}
              className="input-terminal"
              required
              min={1}
              style={{ width: 120 }}
            />

            <button
              type="submit"
              disabled={loading}
              className="btn-primary"
              style={{ minWidth: 120 }}
            >
              {loading ? "Working..." : "Submit Order"}
            </button>
          </form>
        </div>
      ) : (
        <div
          style={{
            background: "#111827",
            border: "1px solid #1f2937",
            borderRadius: 6,
            padding: "10px 12px",
            marginBottom: 10,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div style={{ fontSize: 13, color: "#e5e7eb" }}>
            Demo mode is read-only. Sign in to place real or simulated orders.
          </div>
          <button
            type="button"
            onClick={onSignInClick}
            className="btn-primary"
            style={{ minWidth: 140, fontSize: 13, fontWeight: 600 }}
          >
            Sign in to trade
          </button>
        </div>
      )}

      {/* 
        Mobile Tab Bar
        - Visible only on mobile via CSS.
        - Switches between Order Book / Trades / History so that only one panel
          is visible at a time on small screens.
        - Desktop ignores this (all panels remain visible).
      */}
      <div className="mobile-tabs" style={{ marginBottom: 16, display: "none" }}>
        <button
          type="button"
          onClick={() => setMobileTab("book")}
          className="tab-button"
          style={{
            flex: 1,
            padding: "8px 10px",
            fontSize: 13,
            border: "1px solid",
            borderColor: mobileTab === "book" ? "#3b82f6" : "#374151",
            background: mobileTab === "book" ? "#1f2937" : "#111827",
            color: mobileTab === "book" ? "#e5e7eb" : "#9ca3af",
            cursor: "pointer",
          }}
        >
          Order Book
        </button>
        <button
          type="button"
          onClick={() => setMobileTab("trades")}
          className="tab-button"
          style={{
            flex: 1,
            padding: "8px 10px",
            fontSize: 13,
            border: "1px solid",
            borderColor: mobileTab === "trades" ? "#3b82f6" : "#374151",
            background: mobileTab === "trades" ? "#1f2937" : "#111827",
            color: mobileTab === "trades" ? "#e5e7eb" : "#9ca3af",
            cursor: "pointer",
          }}
        >
          Trades
        </button>
        {tradingEnabled && (
          <button
            type="button"
            onClick={() => setMobileTab("history")}
            className="tab-button"
            style={{
              flex: 1,
              padding: "8px 10px",
              fontSize: 13,
              border: "1px solid",
              borderColor: mobileTab === "history" ? "#3b82f6" : "#374151",
              background: mobileTab === "history" ? "#1f2937" : "#111827",
              color: mobileTab === "history" ? "#e5e7eb" : "#9ca3af",
              cursor: "pointer",
            }}
          >
            Order History
          </button>
        )}
      </div>

      {/* Main Layout: Desktop (2x2 grid) vs Mobile (single panel) */}
      {isMobile ? (
        /* Mobile: Simple block wrapper, render only active panel */
        <div className="main-grid-mobile" style={{ width: "100%" }}>
          {mobileTab === "book" && <OrderBookPanel />}
          {mobileTab === "trades" && <TradesPanel />}
          {tradingEnabled && mobileTab === "history" && <HistoryPanel />}
        </div>
      ) : (
        /* Desktop: 2x2 grid layout with all panels visible */
        <div
          className="main-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
            gridTemplateRows: tradingEnabled ? "minmax(0, 1fr) minmax(0, 1fr)" : "minmax(0, 1fr)",
            gap: 12,
            minHeight: 0,
            minWidth: 0,
            width: "100%",
            flex: "1 1 auto",
            overflow: "hidden",
          }}
        >
          <OrderBookPanel />
          {tradingEnabled && <HistoryPanel />}
          <TradesPanel />
        </div>
      )}
    </>
  );
}

function AuthedView(props: ViewProps) {
  const {
    tickerData,
    isMobile,
    err,
    successMessage,
    setSuccessMessage,
    form,
    setForm,
    submitOrder,
    loading,
    mobileTab,
    setMobileTab,
    OrderBookPanel,
    TradesPanel,
    HistoryPanel,
    balance,
    realizedPnL = null,
    positions = [],
    currentPrice,
    tradingEnabled,
    liveAccountReady,
    devSimulation,
  } = props;

  const { simulationSpeed, setSimulationSpeed } = useMarketMode();

  return (
    <>
      {/* Demo Ticker Bar */}
      <div
        style={{
          background: "#111827",
          border: "1px solid #1f2937",
          borderRadius: 6,
          padding: "8px 12px",
          marginBottom: 0,
          display: "flex",
          alignItems: "center",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: "#f9fafb" }}>$DEMO</span>
          <span
            style={{
              fontSize: 11,
              padding: "2px 6px",
              background: "#1f2937",
              color: "#9ca3af",
              borderRadius: 4,
              fontWeight: 600,
            }}
          >
            {tradingEnabled ? "LIVE" : "VIEW ONLY"}
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 2 }}>Last</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: "#e5e7eb", fontFamily: "monospace" }}>
              ${tickerData.lastPrice.toFixed(2)}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 2 }}>Change</div>
            <div
              style={{
                fontSize: 16,
                fontWeight: 600,
                fontFamily: "monospace",
                color: tickerData.change >= 0 ? "#10b981" : "#ef4444",
              }}
            >
              {tickerData.change >= 0 ? "+" : ""}
              {tickerData.change.toFixed(2)} ({tickerData.changePercent >= 0 ? "+" : ""}
              {tickerData.changePercent.toFixed(2)}%)
            </div>
          </div>

          <div>
            <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 2 }}>Rolling Avg (20)</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: "#e5e7eb", fontFamily: "monospace" }}>
              ${tickerData.rollingAvg.toFixed(2)}
            </div>
          </div>
        </div>
      </div>

      {devSimulation && (
        <DevSettingsPanel
          simulationEnabled={devSimulation.enabled}
          onToggleSimulation={devSimulation.onToggle}
          simulationStarting={devSimulation.starting}
          simulationStopping={devSimulation.stopping}
          simulationSpeed={simulationSpeed}
          setSimulationSpeed={setSimulationSpeed}
        />
      )}

      {/* Candlestick Chart */}
      <div
        className="chart-container"
        style={{
          background: "#111827",
          border: "1px solid #1f2937",
          borderRadius: 6,
          padding: 12,
          marginBottom: 10,
          position: "relative",
          width: "100%",
        }}
      >
        <div style={{ marginBottom: 8 }}>
          <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#9ca3af" }}>Price Trend</h3>
        </div>
        <CandlestickChart />
      </div>

      {/* Error Banner */}
      {err && (
        <div
          style={{
            background: "#7f1d1d",
            border: "1px solid #ef4444",
            color: "#fca5a5",
            padding: "8px 12px",
            borderRadius: 6,
            marginBottom: 10,
            fontSize: 13,
          }}
        >
          {err}
        </div>
      )}

      {/* Success Banner */}
      {successMessage && (
        <div
          style={{
            background: "#065f46",
            border: "1px solid #10b981",
            color: "#6ee7b7",
            padding: "8px 12px",
            borderRadius: 6,
            marginBottom: 10,
            fontSize: 13,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>{successMessage}</span>
          <button
            type="button"
            onClick={() => setSuccessMessage(null)}
            style={{
              background: "transparent",
              border: "none",
              color: "#6ee7b7",
              cursor: "pointer",
              fontSize: 18,
              lineHeight: 1,
              padding: 0,
              marginLeft: 12,
            }}
          >
            ×
          </button>
        </div>
      )}

      {tradingEnabled && (
        <>
          <div
            style={{
              background: "#111827",
              border: "1px solid #1f2937",
              borderRadius: 6,
              padding: "10px 12px",
              marginBottom: 10,
            }}
          >
            <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 4 }}>Account</div>
            {liveAccountReady === false ? (
              <div style={{ fontSize: 14, color: "#6b7280" }}>Loading account…</div>
            ) : (
              <>
                <div style={{ fontSize: 16, fontWeight: 600, color: "#e5e7eb", fontFamily: "monospace" }}>
                  Balance: $
                  {(balance ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    fontFamily: "monospace",
                    marginTop: 6,
                    color:
                      (realizedPnL ?? 0) > 0 ? "#22c55e" : (realizedPnL ?? 0) < 0 ? "#ef4444" : "#9ca3af",
                  }}
                >
                  {`Realized P&L: `}
                  {(realizedPnL ?? 0) >= 0 ? "+" : ""}
                  {(realizedPnL ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </>
            )}
          </div>

          <div
            style={{
              background: "#111827",
              border: "1px solid #1f2937",
              borderRadius: 6,
              padding: "10px 12px",
              marginBottom: 10,
            }}
          >
            <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 8 }}>Positions</div>
            {positions.length === 0 ? (
              <div style={{ fontSize: 13, color: "#9ca3af" }}>No open positions</div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, fontFamily: "monospace" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #1f2937", color: "#6b7280", fontSize: 11 }}>
                      <th style={{ textAlign: "left", padding: "4px 8px 4px 0" }}>Symbol</th>
                      <th style={{ textAlign: "right", padding: "4px 8px" }}>Qty</th>
                      <th style={{ textAlign: "right", padding: "4px 0 4px 8px" }}>Avg Price</th>
                      <th style={{ textAlign: "right", padding: "4px 0 4px 8px" }}>Price</th>
                      <th style={{ textAlign: "right", padding: "4px 0 4px 8px" }}>PNL</th>
                    </tr>
                  </thead>
                  <tbody style={{ color: "#e5e7eb" }}>
                    {positions.map((p, i) => {
                      const hasPrice = currentPrice != null;
                      const pnl = hasPrice ? (currentPrice! - p.avgPrice) * p.quantity : 0;
                      const pnlColor = pnl >= 0 ? "#22c55e" : "#ef4444";
                      return (
                        <tr
                          key={`${p.symbol}-${i}`}
                          style={{ borderBottom: i < positions.length - 1 ? "1px solid #1f2937" : undefined }}
                        >
                          <td style={{ padding: "6px 8px 6px 0", fontWeight: 600 }}>{p.symbol}</td>
                          <td style={{ textAlign: "right", padding: "6px 8px" }}>{p.quantity}</td>
                          <td style={{ textAlign: "right", padding: "6px 0 6px 8px" }}>
                            ${p.avgPrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td style={{ textAlign: "right", padding: "6px 0 6px 8px" }}>
                            {hasPrice
                              ? `$${currentPrice!.toLocaleString("en-US", {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}`
                              : "—"}
                          </td>
                          <td style={{ textAlign: "right", padding: "6px 0 6px 8px", color: hasPrice ? pnlColor : "#9ca3af" }}>
                            {hasPrice
                              ? `${pnl >= 0 ? "" : "-"}$${Math.abs(pnl).toLocaleString("en-US", {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}`
                              : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* Order Form - Compact Ticket (live + signed in only) */}
      <div
        style={{
          background: "#111827",
          border: "1px solid #1f2937",
          borderRadius: 6,
          padding: "10px 12px",
          marginBottom: 10,
        }}
      >
        {tradingEnabled ? (
          <form
            onSubmit={submitOrder}
            style={{
              display: "flex",
              gap: 10,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value as "buy" | "sell" })}
              className="input-terminal"
              style={{ minWidth: 80 }}
            >
              <option value="buy">Buy</option>
              <option value="sell">Sell</option>
            </select>

            <input
              type="number"
              placeholder="Price"
              value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value })}
              className="input-terminal"
              required
              min={0}
              step="0.01"
              style={{ width: 120 }}
            />

            <input
              type="number"
              placeholder="Quantity"
              value={form.quantity}
              onChange={(e) => setForm({ ...form, quantity: e.target.value })}
              className="input-terminal"
              required
              min={1}
              style={{ width: 120 }}
            />

            <button
              type="submit"
              disabled={loading}
              className="btn-primary"
              style={{ minWidth: 120 }}
            >
              {loading ? "Working..." : "Submit Order"}
            </button>
          </form>
        ) : (
          <div style={{ fontSize: 13, color: "#9ca3af", lineHeight: 1.5 }}>
            <strong style={{ color: "#e5e7eb" }}>View-only.</strong> Open <strong>Live Market</strong> from Home to
            place orders and manage your account.
          </div>
        )}
      </div>

      {/* 
        Mobile Tab Bar
        - Visible only on mobile via CSS.
        - Switches between Order Book / Trades / History so that only one panel
          is visible at a time on small screens.
        - Desktop ignores this (all panels remain visible).
      */}
      <div className="mobile-tabs" style={{ marginBottom: 16, display: "none" }}>
        <button
          type="button"
          onClick={() => setMobileTab("book")}
          className="tab-button"
          style={{
            flex: 1,
            padding: "8px 10px",
            fontSize: 13,
            border: "1px solid",
            borderColor: mobileTab === "book" ? "#3b82f6" : "#374151",
            background: mobileTab === "book" ? "#1f2937" : "#111827",
            color: mobileTab === "book" ? "#e5e7eb" : "#9ca3af",
            cursor: "pointer",
          }}
        >
          Order Book
        </button>
        <button
          type="button"
          onClick={() => setMobileTab("trades")}
          className="tab-button"
          style={{
            flex: 1,
            padding: "8px 10px",
            fontSize: 13,
            border: "1px solid",
            borderColor: mobileTab === "trades" ? "#3b82f6" : "#374151",
            background: mobileTab === "trades" ? "#1f2937" : "#111827",
            color: mobileTab === "trades" ? "#e5e7eb" : "#9ca3af",
            cursor: "pointer",
          }}
        >
          Trades
        </button>
        {tradingEnabled && (
          <button
            type="button"
            onClick={() => setMobileTab("history")}
            className="tab-button"
            style={{
              flex: 1,
              padding: "8px 10px",
              fontSize: 13,
              border: "1px solid",
              borderColor: mobileTab === "history" ? "#3b82f6" : "#374151",
              background: mobileTab === "history" ? "#1f2937" : "#111827",
              color: mobileTab === "history" ? "#e5e7eb" : "#9ca3af",
              cursor: "pointer",
            }}
          >
            Order History
          </button>
        )}
      </div>

      {/* Main Layout: Desktop (2x2 grid) vs Mobile (single panel) */}
      {isMobile ? (
        /* Mobile: Simple block wrapper, render only active panel */
        <div className="main-grid-mobile" style={{ width: "100%" }}>
          {mobileTab === "book" && <OrderBookPanel />}
          {mobileTab === "trades" && <TradesPanel />}
          {tradingEnabled && mobileTab === "history" && <HistoryPanel />}
        </div>
      ) : (
        /* Desktop: 2x2 grid layout with all panels visible */
        <div
          className="main-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
            gridTemplateRows: tradingEnabled ? "minmax(0, 1fr) minmax(0, 1fr)" : "minmax(0, 1fr)",
            gap: 12,
            minHeight: 0,
            minWidth: 0,
            width: "100%",
            flex: "1 1 auto",
            overflow: "hidden",
          }}
        >
          <OrderBookPanel />
          {tradingEnabled && <HistoryPanel />}
          <TradesPanel />
        </div>
      )}
    </>
  );
}

type TradingDashboardProps = {
  mode?: "full" | "demo";
};

export default function TradingDashboard({ mode = "full" }: TradingDashboardProps) {
  const navigate = useNavigate();
  const {
    isAuthed: contextIsAuthed,
    user: contextUser,
    logout: contextLogout,
    authFetch,
    loading: authLoading,
  } = useAuth();
  const { marketView, simulationSpeed } = useMarketMode();
  /** Live data + trading UI: only when signed in and viewing Live market. */
  const tradingEnabled = marketView === "live" && contextIsAuthed;
  const useLiveData = tradingEnabled;
  const paperStorageKey = contextUser?.email ? `paperTrading:${contextUser.email}` : null;

  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  
  const [orderBook, setOrderBook] = useState<Order[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [orderHistory, setOrderHistory] = useState<Order[]>([]);
  const [form, setForm] = useState({ type: "buy" as "buy" | "sell", price: "", quantity: "" });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [paperState, setPaperState] = useState<PaperState>(() => loadPaperState(null));
  const lastErrorRef = useRef<string | null>(null);

  /** Sync paper portfolio from localStorage before paint; create default row for new users (no overwrite). */
  useLayoutEffect(() => {
    if (!paperStorageKey || !contextIsAuthed) {
      setPaperState(loadPaperState(null));
      return;
    }
    const existing = localStorage.getItem(paperStorageKey);
    if (!existing) {
      const next = { ...PAPER_DEFAULT };
      savePaperState(paperStorageKey, next);
      setPaperState(next);
    } else {
      setPaperState(loadPaperState(paperStorageKey));
    }
  }, [paperStorageKey, contextIsAuthed]);

  const paperAccountReady =
    Boolean(paperStorageKey) && tradingEnabled && !authLoading && Boolean(contextUser?.email);

  const displayPositions = useMemo(() => {
    if (!tradingEnabled) return [];
    if (paperState.positionQty > 0) {
      return [{ symbol: "DEMO", quantity: paperState.positionQty, avgPrice: paperState.avgCost }];
    }
    return [];
  }, [tradingEnabled, paperState.positionQty, paperState.avgCost]);

  const showError = useCallback(
    (message: string | null) => {
      if (message && message === lastErrorRef.current) {
        return;
      }
      lastErrorRef.current = message;
      setErr(message);
    },
    []
  );
  const [myOrderIds, setMyOrderIds] = useState<Set<string>>(() => {
    try {
      if (!localStorage.getItem("token")) return new Set();
      const stored = localStorage.getItem("myOrderIds");
      if (stored) {
        const ids = JSON.parse(stored) as string[];
        return new Set(ids);
      }
    } catch (e) {
      console.error("Failed to load myOrderIds from localStorage", e);
    }
    return new Set<string>();
  });

  useEffect(() => {
    if (!contextIsAuthed) return;
    try {
      const idsArray = Array.from(myOrderIds);
      localStorage.setItem("myOrderIds", JSON.stringify(idsArray));
    } catch (e) {
      console.error("Failed to save myOrderIds to localStorage", e);
    }
  }, [myOrderIds, contextIsAuthed]);

  const [historyFilter, setHistoryFilter] = useState<"all" | "open" | "filled">("all");
  const [mineOnly, setMineOnly] = useState(false);
  const [lastTradeId, setLastTradeId] = useState<string | null>(null);
  const flashRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  
  const [simulationEnabled, setSimulationEnabled] = useState(false);
  const [simulationStarting, setSimulationStarting] = useState(false);
  const [simulationStopping, setSimulationStopping] = useState(false);
  const headerSimulationActive = !contextIsAuthed || simulationEnabled;
  const marketStatus = headerSimulationActive ? "LIVE" : "IDLE";
  const marketDot = headerSimulationActive ? "#10b981" : "#6b7280";
  
  const currentPrice: number | null =
    trades.length > 0 ? trades[trades.length - 1].price : null;

  // Mobile layout tab state: which panel is visible on small screens.
  // Desktop ignores this and shows all panels.
  const [mobileTab, setMobileTab] = useState<"book" | "trades" | "history">("book");

  useEffect(() => {
    if (!tradingEnabled && mobileTab === "history") {
      setMobileTab("book");
    }
  }, [tradingEnabled, mobileTab, setMobileTab]);
  
  // State for relative time updates (updates every 5 seconds; value triggers re-renders)
  const [, setTimeNow] = useState(Date.now());
  
  useEffect(() => {
    const ms = simulationSpeed === "fast" ? 1000 : 5000;
    const interval = setInterval(() => {
      setTimeNow(Date.now());
    }, ms);
    return () => clearInterval(interval);
  }, [simulationSpeed]);

  // Mobile breakpoint detection: width < 768 OR height <= 520
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const checkMobile = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      setIsMobile(width < 768 || height <= 520);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // UI-only visible row limits (no backend changes)
  // Exchange-like defaults: Order Book depth 20, Trades 50, History 30
  const [tradesVisibleCount, setTradesVisibleCount] = useState(50);
  const [bookVisibleCount, setBookVisibleCount] = useState(20);
  const [historyVisibleCount, setHistoryVisibleCount] = useState(30);

  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  // Auth modal state (reserved for future AuthWidget integration)
  // const [authOpen, setAuthOpen] = useState(false);
  // const [authMode, setAuthMode] = useState<"login" | "register">("login");
  // const [authEmail, setAuthEmail] = useState("");
  // const [authPassword, setAuthPassword] = useState("");
  // const [currentUser, setCurrentUser] = useState<{ email: string } | null>(null);
  // const logout = () => {
  //   localStorage.removeItem("token");
  //   setCurrentUser(null);
  //   setMineOnly(false);
  //   setSuccessMessage("Logged out");
  //   setTimeout(() => setSuccessMessage(null), 2000);
  // };
  // handleAuth reserved for future AuthWidget integration
  // const handleAuth = async (e: React.FormEvent) => {
  //   e.preventDefault();
  //   setLoading(true);
  //   setErr(null);
  //   try {
  //     const endpoint =
  //       authMode === "login"
  //         ? `${API_BASE_URL}/auth/login`
  //         : `${API_BASE_URL}/auth/register`;
  //     const res = await fetch(endpoint, {
  //       method: "POST",
  //       headers: { "Content-Type": "application/json" },
  //       body: JSON.stringify({ email: authEmail, password: authPassword }),
  //     });
  //     if (!res.ok) {
  //       const msg = await res.json().catch(() => null);
  //       throw new Error(msg?.error || "Auth failed");
  //     }
  //     const data = await res.json();
  //     if (data?.token) localStorage.setItem("token", data.token);
  //     const email = data?.user?.email || authEmail;
  //     setCurrentUser({ email });
  //     setAuthPassword("");
  //     setSuccessMessage(`${authMode === "login" ? "Logged in" : "Registered"} as ${email}`);
  //     setTimeout(() => setSuccessMessage(null), 3000);
  //     await fetchAllData();
  //   } catch (e: any) {
  //     setErr(e?.message || "Auth failed");
  //   } finally {
  //     setLoading(false);
  //   }
  // };

  const fetchAllData = async () => {
    if (contextIsAuthed) {
      showError(null);
    }

    let historyUrl = `${API_BASE_URL}/api/orders/history?limit=50`;
    if (mineOnly && myOrderIds.size > 0) {
      const idsParam = Array.from(myOrderIds).join(",");
      historyUrl = `${API_BASE_URL}/api/orders/by-ids?ids=${idsParam}`;
    }

    const bookUrl = useLiveData
      ? `${API_BASE_URL}/api/orders/open?limit=200`
      : `${API_BASE_URL}/api/orders/book`;

    const tradesUrl = useLiveData
      ? `${API_BASE_URL}/api/orders/trades/db?limit=200`
      : `${API_BASE_URL}/api/orders/trades?limit=200`;

    let filteredBookForFlash: Order[] = [];

    try {
      const bookRes = useLiveData ? await authFetch(bookUrl) : await fetch(bookUrl);
      if (bookRes.ok) {
        const bookData = await bookRes.json();
        const normalizedBook: Order[] = Array.isArray(bookData)
          ? bookData
          : [...(bookData.buy || []), ...(bookData.sell || [])];
        filteredBookForFlash = normalizedBook.filter((o: Order) => o.quantity > 0);
        setOrderBook(filteredBookForFlash);
      } else {
        console.warn("[fetchAllData] book HTTP", bookRes.status);
      }
    } catch (e) {
      console.error("[fetchAllData] book failed", e);
    }

    let tradesData: Trade[] = [];
    try {
      const tradesRes = useLiveData ? await authFetch(tradesUrl) : await fetch(tradesUrl);
      if (tradesRes.ok) {
        const parsed = await tradesRes.json();
        tradesData = Array.isArray(parsed) ? parsed : [];
        setTrades(tradesData);
      } else {
        console.warn("[fetchAllData] trades HTTP", tradesRes.status);
      }
    } catch (e) {
      console.error("[fetchAllData] trades failed", e);
    }

    if (useLiveData) {
      try {
        const historyRes = await authFetch(historyUrl);
        if (historyRes.ok) {
          const historyData = await historyRes.json();
          setOrderHistory(Array.isArray(historyData) ? historyData : []);
        } else {
          console.warn("[fetchAllData] history HTTP", historyRes.status);
        }
      } catch (e) {
        console.error("[fetchAllData] history failed", e);
      }
    } else {
      setOrderHistory([]);
    }

    if (tradesData.length > 0) {
      const newestTrade = tradesData[0];
      const tradeKey = newestTrade.id || newestTrade.createdAt;
      if (tradeKey && tradeKey !== lastTradeId) {
        setLastTradeId(tradeKey);

        const buyPrices = filteredBookForFlash.filter((o: Order) => o.type === "buy").map((o: Order) => o.price);
        const sellPrices = filteredBookForFlash.filter((o: Order) => o.type === "sell").map((o: Order) => o.price);
        const avgBuy = buyPrices.length ? buyPrices.reduce((a: number, b: number) => a + b, 0) / buyPrices.length : 0;
        const avgSell = sellPrices.length ? sellPrices.reduce((a: number, b: number) => a + b, 0) / sellPrices.length : 0;
        const midpoint = avgBuy > 0 && avgSell > 0 ? (avgBuy + avgSell) / 2 : newestTrade.price;
        const isBuySide = newestTrade.price >= midpoint;

        setTimeout(() => {
          const element = flashRefs.current.get(tradeKey);
          if (element) {
            element.style.animation = "none";
            setTimeout(() => {
              if (isBuySide) {
                element.style.background = "#064e3b";
                element.style.borderLeft = "2px solid #10b981";
              } else {
                element.style.background = "#7f1d1d";
                element.style.borderLeft = "2px solid #ef4444";
              }
              setTimeout(() => {
                element.style.background = "#0f172a";
                element.style.borderLeft = "2px solid #1f2937";
              }, 1500);
            }, 10);
          }
        }, 100);
      }
    }

    setLastSyncAt(Date.now());
  };

  // Poll all endpoints every 2s (regardless of demoMode).
  // Initial fetch whenever filters change (mineOnly / myOrderIds) – always run once.
  useEffect(() => {
    fetchAllData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mineOnly, myOrderIds.size, marketView, useLiveData]);

  // WebSocket callbacks for real-time updates
  const handleBookUpdate = useCallback((book: unknown) => {
    // Normalize and filter like fetchAllData does
    // Handle both array format and { buy: [], sell: [] } format
    const normalizedBook: Order[] = Array.isArray(book)
      ? (book as Order[])
      : [...((book as { buy?: Order[]; sell?: Order[] }).buy || []), ...((book as { buy?: Order[]; sell?: Order[] }).sell || [])];
    const filteredBook = normalizedBook.filter((o: Order) => o.quantity > 0);
    setOrderBook(filteredBook);
  }, []);

  const handleTradesUpdate = useCallback((trades: unknown[]) => {
    setTrades(trades as Trade[]);
  }, []);

  const { wsConnected } = useMarketWebSocket({
    enabled: contextIsAuthed || simulationEnabled,
    onBook: handleBookUpdate,
    onTrades: handleTradesUpdate,
  });

  const { isOffline } = useSmartPolling(fetchAllData, {
    enabled: (contextIsAuthed || simulationEnabled) && !wsConnected,
  });

  // Build order book: separate buy/sell, sort
  const { buy, sell } = useMemo(() => {
    const buyOrders = orderBook
      .filter((o) => o.type === "buy")
      .sort((a, b) => b.price - a.price);
    const sellOrders = orderBook
      .filter((o) => o.type === "sell")
      .sort((a, b) => a.price - b.price);
    return { buy: buyOrders, sell: sellOrders };
  }, [orderBook]);

  // const isActive = buy.length + sell.length > 0;
  const totalTrades = trades.length;

  const submitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tradingEnabled) {
      showError("Open Live Market from Home to place orders.");
      return;
    }
    setLoading(true);
    showError(null);

    try {
      const price = Number(form.price);
      const quantity = Number(form.quantity);

      if (!form.type || Number.isNaN(price) || Number.isNaN(quantity) || quantity <= 0) {
        setErr("Enter a valid type / price / quantity");
        setLoading(false);
        return;
      }

      const endpoint = useLiveData
        ? `${API_BASE_URL}/api/orders`
        : `${API_BASE_URL}/api/orders/demo`;

      const commonInit: RequestInit = {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ type: form.type, price, quantity }),
      };

      const res = useLiveData
        ? await authFetch(endpoint, commonInit)
        : await fetch(endpoint, commonInit);

      if (!res.ok) {
        const msg = await res.json().catch(() => null);
        throw new Error(msg?.error || "Order failed");
      }

      const orderData = await res.json().catch(() => null);
      const orderId =
        orderData?.order?.id ??
        orderData?.id ??
        orderData?.orderId ??
        null;

      if (contextIsAuthed && orderData && paperStorageKey) {
        setPaperState((prev) => {
          const next = applyPaperAfterDemoOrder(form, orderData, prev);
          savePaperState(paperStorageKey, next);
          return next;
        });
      }

      if (orderId && contextIsAuthed) {
        setMyOrderIds((prev) => new Set(Array.from(prev).concat(String(orderId))));
      }

      setForm({ type: "buy", price: "", quantity: "" });
      setSuccessMessage(`Order submitted successfully${orderId ? ` (ID: ${orderId})` : ""}`);
      setTimeout(() => setSuccessMessage(null), 4000);
      await fetchAllData();

      setTimeout(async () => {
        if (!useLiveData) return;

        await fetchAllData();

        const updatedHistory = await authFetch(`${API_BASE_URL}/api/orders/history?limit=50`)
          .then((r) => r.json())
          .catch(() => []);

        if (orderId) {
          const filledOrder = updatedHistory.find(
            (o: Order) => String(o.id) === String(orderId) && o.status === "FILLED"
          );
          if (filledOrder) {
            setSuccessMessage(`Order ${orderId} filled!`);
            setTimeout(() => setSuccessMessage(null), 4000);
          }
        }
      }, 500);

    } catch (e: any) {
      let message = e?.message || "Submit failed";
      if (isBrowserNetworkError(e)) {
        console.error("Network error while submitting order", e);
        message =
          !useLiveData || simulationEnabled
            ? "Demo market running locally"
            : "Unable to reach the exchange API. Please try again in a moment.";
      }
      showError(message);
    } finally {
      setLoading(false);
    }
  };

  const cancelOrder = async (id: string) => {
    setLoading(true);
    showError(null);

    try {
      const res = useLiveData
        ? await authFetch(`${API_BASE_URL}/api/orders/${id}`, { method: "DELETE" })
        : await fetch(`${API_BASE_URL}/api/orders/${id}`, { method: "DELETE" });

      if (!res.ok) {
        const msg = await res.json().catch(() => null);
        throw new Error(msg?.message || "Cancel failed");
      }

      await fetchAllData();
    } catch (e: any) {
      let message = e?.message || "Cancel failed";
      if (isBrowserNetworkError(e)) {
        console.error("Network error while cancelling order", e);
        message =
          marketView === "demo" || simulationEnabled
            ? "Demo market running locally"
            : "Unable to reach the exchange API. Please try again in a moment.";
      }
      showError(message);
    } finally {
      setLoading(false);
    }
  };

  // Trades: newest first
  const sortedTrades = useMemo(() => {
    return [...trades].sort((a, b) => {
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return tb - ta;
    });
  }, [trades]);

  // Filtered order history based on tab selection
  // When mineOnly is true, we already fetch only my orders from the backend,
  // so we only need to apply status filters here
  const filteredOrderHistory = useMemo(() => {
    let result = orderHistory;
    
    if (historyFilter === "open") {
      result = result.filter((o) => o.status === "OPEN" || o.status === "PARTIAL");
    } else if (historyFilter === "filled") {
      result = result.filter((o) => o.status === "FILLED");
    }
    
    // When mineOnly is true, we're already fetching only my orders from the backend
    // No need for additional client-side filtering
    
    return result;
  }, [orderHistory, historyFilter]);

  // Compute ticker data: last price, change, rolling avg
  const tickerData = useMemo(() => {
    if (sortedTrades.length === 0) {
      return {
        lastPrice: 10.0,
        change: 0,
        changePercent: 0,
        rollingAvg: 10.0,
      };
    }

    const lastPrice = sortedTrades[0].price;
    const prevPrice = sortedTrades.length > 1 ? sortedTrades[1].price : lastPrice;
    const change = lastPrice - prevPrice;
    const changePercent = prevPrice !== 0 ? (change / prevPrice) * 100 : 0;

    // Rolling average of last 20 trades
    const recentTrades = sortedTrades.slice(0, 20);
    const rollingAvg =
      recentTrades.reduce((sum, t) => sum + t.price, 0) / recentTrades.length;

    return {
      lastPrice,
      change,
      changePercent,
      rollingAvg,
    };
  }, [sortedTrades]);

  // Sync demo status; when signed in, start the demo if it is not running (same idea as GuestDemo).
  useEffect(() => {
    const syncDemoStatus = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/demo/status`);
        if (res.ok) {
          const data = await res.json();
          if (data?.running !== undefined) {
            setSimulationEnabled(data.running);
          }
          if (authLoading) return;
          if (contextIsAuthed && data && data.running === false) {
            const startRes = await authFetch(`${API_BASE_URL}/api/demo/start`, { method: "POST" });
            if (startRes.ok) {
              setSimulationEnabled(true);
              window.dispatchEvent(new Event("demo-status-changed"));
            }
          }
        }
      } catch (e) {
        console.debug("Failed to sync demo status:", e);
      }
    };

    syncDemoStatus();

    const handleStatusChange = () => {
      syncDemoStatus();
    };
    window.addEventListener("demo-status-changed", handleStatusChange);

    return () => {
      window.removeEventListener("demo-status-changed", handleStatusChange);
    };
  }, [contextIsAuthed, authLoading, authFetch]);

  const handleSimulationToggle = async (checked: boolean) => {
    const previousValue = simulationEnabled;

    setSimulationEnabled(checked);

    try {
      if (checked) {
        setSimulationStarting(true);
        const res = contextIsAuthed
          ? await authFetch(`${API_BASE_URL}/api/demo/start`, { method: "POST" })
          : await fetch(`${API_BASE_URL}/api/demo/start`, { method: "POST" });

        if (!res.ok) {
          const msg = await res.json().catch(() => null);
          throw new Error(msg?.error || "Failed to start demo mode");
        }
      } else {
        setSimulationStopping(true);
        const res = contextIsAuthed
          ? await authFetch(`${API_BASE_URL}/api/demo/stop`, { method: "POST" })
          : await fetch(`${API_BASE_URL}/api/demo/stop`, { method: "POST" });

        if (!res.ok) {
          const msg = await res.json().catch(() => null);
          throw new Error(msg?.error || "Failed to stop demo mode");
        }
      }
    } catch (e: any) {
      setSimulationEnabled(previousValue);
      if (isBrowserNetworkError(e)) {
        showError(
          !contextIsAuthed
            ? "Demo market running locally"
            : "Unable to reach the exchange API. Please try again shortly."
        );
      } else {
        showError(e?.message || "Failed to toggle simulation. Please try again.");
      }
    } finally {
      setSimulationStarting(false);
      setSimulationStopping(false);
    }
  };

  // Panel components (reusable for desktop grid and mobile single-panel)
  // These functions return JSX that can be placed in either layout context
  const OrderBookPanel = () => (
    <div
      className="orderbook-card"
      style={{
        background: "#111827",
        border: "1px solid #1f2937",
        borderRadius: 6,
        padding: 12,
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        minWidth: 0,
        overflow: "hidden",
        ...(isMobile
          ? {}
          : tradingEnabled
            ? { gridColumn: "1 / 2", gridRow: "1 / span 2" }
            : { gridColumn: "1 / 2", gridRow: "1 / 2" }),
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "#f9fafb" }}>
          Order Book
        </h3>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 12, color: "#9ca3af" }}>Depth:</span>
          <select
            value={bookVisibleCount}
            onChange={(e) => setBookVisibleCount(Number(e.target.value))}
            className="input-terminal"
            style={{
              padding: "4px 8px",
              fontSize: 12,
              minWidth: 80,
            }}
          >
            <option value={15}>15</option>
            <option value={30}>30</option>
            <option value={50}>50</option>
          </select>
        </div>
      </div>

      <div
        className="orderbook-columns"
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
          gap: 10,
          flex: 1,
          minHeight: 0,
          minWidth: 0,
        }}
      >
        {/* BUY Column */}
        <div style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
          <h4
            style={{
              margin: "0 0 6px 0",
              fontSize: 12,
              fontWeight: 600,
              color: "#10b981",
              textTransform: "uppercase",
              letterSpacing: 0.5,
            }}
          >
            Buy
          </h4>
          {buy.length === 0 ? (
            <div style={{ fontSize: 12, color: "#6b7280", padding: "8px 0" }}>
              No active buys
            </div>
          ) : (
                  <div className="panel-scroll" style={{ display: "flex", flexDirection: "column", gap: 4, minHeight: 0, maxHeight: isMobile ? "300px" : "500px", overflowY: "auto" }}>
                    {buy.slice(0, bookVisibleCount).map((o) => (
                <div
                  key={o.id}
                  style={{
                    background: myOrderIds.has(String(o.id)) ? "#1e3a8a" : "#0f172a",
                    border: myOrderIds.has(String(o.id)) ? "1px solid #3b82f6" : "1px solid #1e293b",
                    padding: "8px 10px",
                    borderRadius: 4,
                    fontSize: 12,
                    minWidth: 0,
                    position: "relative",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4, gap: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                      <span className="mono-id" style={{ fontFamily: "monospace", color: "#9ca3af", minWidth: 0 }}>
                        #{o.id}
                      </span>
                      {myOrderIds.has(String(o.id)) && (
                        <span
                          style={{
                            fontSize: 9,
                            padding: "1px 4px",
                            background: "#3b82f6",
                            color: "#ffffff",
                            borderRadius: 3,
                            fontWeight: 700,
                            letterSpacing: 0.5,
                          }}
                        >
                          YOU
                        </span>
                      )}
                    </div>
                    <StatusChip status={o.status} />
                  </div>

                  <div style={{ color: "#e5e7eb", marginBottom: 2 }}>
                    <span style={{ color: "#10b981", fontWeight: 600 }}>{o.quantity}</span>{" "}
                    @ <span style={{ fontFamily: "monospace" }}>${o.price}</span>
                    {myOrderIds.has(String(o.id)) && (() => {
                      const qty = o.originalQuantity ?? o.quantity;
                      const remain = o.quantity;
                      const filled = Math.max(0, qty - remain);
  return (
                        <div style={{ fontSize: 10, color: "#6b7280", marginTop: 2 }}>
                          Filled {Math.floor(filled)} / Qty {Math.floor(qty)}
                        </div>
                      );
                    })()}
                  </div>

                  {contextIsAuthed &&
                    tradingEnabled &&
                    (o.status === "OPEN" || o.status === "PARTIAL") &&
                    myOrderIds.has(String(o.id)) && (
                    <button
                      onClick={() => cancelOrder(o.id)}
                      disabled={loading}
                      className="btn-danger cancel-btn"
                      style={{ marginTop: 6, width: "100%" }}
                    >
                      Cancel
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* SELL Column */}
        <div style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
          <h4
            style={{
              margin: "0 0 6px 0",
              fontSize: 12,
              fontWeight: 600,
              color: "#ef4444",
              textTransform: "uppercase",
              letterSpacing: 0.5,
            }}
          >
            Sell
          </h4>
          {sell.length === 0 ? (
            <div style={{ fontSize: 12, color: "#6b7280", padding: "8px 0" }}>
              No active sells
            </div>
          ) : (
                  <div className="panel-scroll" style={{ display: "flex", flexDirection: "column", gap: 4, minHeight: 0, maxHeight: isMobile ? "300px" : "500px", overflowY: "auto" }}>
                    {sell.slice(0, bookVisibleCount).map((o) => (
        <div
                  key={o.id}
          style={{
                    background: myOrderIds.has(String(o.id)) ? "#1e3a8a" : "#0f172a",
                    border: myOrderIds.has(String(o.id)) ? "1px solid #3b82f6" : "1px solid #1e293b",
            padding: "8px 10px",
                    borderRadius: 4,
                    fontSize: 12,
                    minWidth: 0,
                    position: "relative",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4, gap: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                      <span className="mono-id" style={{ fontFamily: "monospace", color: "#9ca3af", minWidth: 0 }}>
                        #{o.id}
                      </span>
                      {myOrderIds.has(String(o.id)) && (
                        <span
                          style={{
                            fontSize: 9,
                            padding: "1px 4px",
                            background: "#3b82f6",
                            color: "#ffffff",
                            borderRadius: 3,
                            fontWeight: 700,
                            letterSpacing: 0.5,
                          }}
                        >
                          YOU
                        </span>
                      )}
        </div>
                    <StatusChip status={o.status} />
                  </div>

                  <div style={{ color: "#e5e7eb", marginBottom: 2 }}>
                    <span style={{ color: "#ef4444", fontWeight: 600 }}>{o.quantity}</span>{" "}
                    @ <span style={{ fontFamily: "monospace" }}>${o.price}</span>
                    {myOrderIds.has(String(o.id)) && (() => {
                      const qty = o.originalQuantity ?? o.quantity;
                      const remain = o.quantity;
                      const filled = Math.max(0, qty - remain);
                      return (
                        <div style={{ fontSize: 10, color: "#6b7280", marginTop: 2 }}>
                          Filled {Math.floor(filled)} / Qty {Math.floor(qty)}
                        </div>
                      );
                    })()}
                  </div>

                  {contextIsAuthed &&
                    tradingEnabled &&
                    (o.status === "OPEN" || o.status === "PARTIAL") &&
                    myOrderIds.has(String(o.id)) && (
                    <button
                      onClick={() => cancelOrder(o.id)}
                      disabled={loading}
                      className="btn-danger cancel-btn"
                      style={{ marginTop: 6, width: "100%" }}
                    >
                      Cancel
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const TradesPanel = () => (
    <div
      className="trades-card"
      style={{
        background: "#111827",
        border: "1px solid #1f2937",
        borderRadius: 6,
        padding: 12,
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        minWidth: 0,
        overflow: "hidden",
        ...(isMobile
          ? {}
          : tradingEnabled
            ? { gridColumn: "2 / 3", gridRow: "2 / 3" }
            : { gridColumn: "2 / 3", gridRow: "1 / 2" }),
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "#f9fafb" }}>Trades</h3>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 12, color: "#9ca3af" }}>Rows:</span>
        <select
            value={tradesVisibleCount}
            onChange={(e) => setTradesVisibleCount(Number(e.target.value))}
            className="input-terminal"
            style={{
              padding: "4px 8px",
              fontSize: 12,
              minWidth: 80,
            }}
        >
            <option value={15}>15</option>
            <option value={30}>30</option>
            <option value={50}>50</option>
        </select>
        </div>
      </div>

      {sortedTrades.length === 0 ? (
        <div style={{ fontSize: 12, color: "#6b7280", padding: "8px 0" }}>No trades yet</div>
      ) : (
        <div className="panel-scroll" style={{ display: "flex", flexDirection: "column", gap: 4, minHeight: 0, maxHeight: isMobile ? "300px" : "400px", overflowY: "auto" }}>
          {sortedTrades.slice(0, tradesVisibleCount).map((t, i) => {
            const tradeKey = t.id || t.createdAt || `trade-${i}`;
            // Determine trade direction for coloring
            const buyPrices = buy.map((o) => o.price);
            const sellPrices = sell.map((o) => o.price);
            const avgBuy = buyPrices.length > 0 ? buyPrices.reduce((a, b) => a + b, 0) / buyPrices.length : 0;
            const avgSell = sellPrices.length > 0 ? sellPrices.reduce((a, b) => a + b, 0) / sellPrices.length : 0;
            const midpoint = avgBuy > 0 && avgSell > 0 ? (avgBuy + avgSell) / 2 : t.price;
            const isBuySide = t.price >= midpoint;
            
            return (
              <div
                key={tradeKey}
                ref={(el) => {
                  if (el) flashRefs.current.set(tradeKey, el);
                }}
                className="trade-row"
                style={{
                  background: "#0f172a",
                  borderLeft: "2px solid #1f2937",
                  padding: "8px 10px",
                  borderRadius: 4,
                  fontSize: 12,
                  fontFamily: "monospace",
                  minWidth: 0,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                  <span className="trade-left" style={{ color: "#9ca3af", minWidth: 0 }}>
                    <span style={{ color: "#10b981" }}>B:{t.buyOrderId}</span> →{" "}
                    <span style={{ color: "#ef4444" }}>S:{t.sellOrderId}</span>
                  </span>
                  <span style={{ color: "#e5e7eb", whiteSpace: "nowrap" }}>
                    {t.quantity} @ <span style={{ fontWeight: 600, color: isBuySide ? "#10b981" : "#ef4444" }}>${t.price}</span>
                  </span>
                </div>
                {t.createdAt && (
                  <div style={{ fontSize: 11, color: "#6b7280", marginTop: 4 }}>{formatRelativeTime(t.createdAt)}</div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  const handleCancelOrder = async (orderId: string) => {
    if (!tradingEnabled) return;
    try {
      showError(null);
      const res = useLiveData
        ? await authFetch(`${API_BASE_URL}/api/orders/${orderId}`, { method: "DELETE" })
        : await fetch(`${API_BASE_URL}/api/orders/${orderId}`, { method: "DELETE" });
      if (!res.ok) {
        const msg = await res.json().catch(() => null);
        throw new Error(msg?.error || "Failed to cancel order");
      }
      await fetchAllData();
      setSuccessMessage("Order canceled");
    } catch (e: any) {
      let message = e?.message || "Failed to cancel order";
      if (isBrowserNetworkError(e)) {
        message =
          !useLiveData || simulationEnabled
            ? "Demo market running locally"
            : "Unable to reach the exchange API. Please try again in a moment.";
      }
      showError(message);
    }
  };

  const HistoryPanel = () => (
    <div
      className="history-card"
      style={{
        background: "#111827",
        border: "1px solid #1f2937",
        borderRadius: 6,
        padding: 12,
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        minWidth: 0,
        overflow: "hidden",
        ...(isMobile ? {} : { gridColumn: "2 / 3", gridRow: "1 / 2" }),
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "#f9fafb" }}>Order History</h3>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {/* Filter Tabs */}
          <div style={{ display: "flex", gap: 4, border: "1px solid #1f2937", borderRadius: 4, padding: 2 }}>
            <button
              type="button"
              onClick={() => setHistoryFilter("all")}
              style={{
                padding: "4px 8px",
                fontSize: 11,
                fontWeight: 600,
                background: historyFilter === "all" ? "#3b82f6" : "transparent",
                color: historyFilter === "all" ? "#ffffff" : "#9ca3af",
                border: "none",
                borderRadius: 3,
                cursor: "pointer",
              }}
            >
              All
        </button>
        <button
          type="button"
              onClick={() => setHistoryFilter("open")}
              style={{
                padding: "4px 8px",
                fontSize: 11,
                fontWeight: 600,
                background: historyFilter === "open" ? "#3b82f6" : "transparent",
                color: historyFilter === "open" ? "#ffffff" : "#9ca3af",
                border: "none",
                borderRadius: 3,
                cursor: "pointer",
              }}
        >
              Open
        </button>
            <button
              type="button"
              onClick={() => setHistoryFilter("filled")}
              style={{
                padding: "4px 8px",
                fontSize: 11,
                fontWeight: 600,
                background: historyFilter === "filled" ? "#3b82f6" : "transparent",
                color: historyFilter === "filled" ? "#ffffff" : "#9ca3af",
                border: "none",
                borderRadius: 3,
                cursor: "pointer",
              }}
            >
              Filled
            </button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {contextIsAuthed && (
            <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 12, color: "#9ca3af" }}>
              <input
                type="checkbox"
                checked={mineOnly}
                onChange={(e) => setMineOnly(e.target.checked)}
                style={{ cursor: "pointer" }}
              />
              <span>Mine</span>
            </label>
          )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 12, color: "#9ca3af" }}>Rows:</span>
            <select
              value={historyVisibleCount}
              onChange={(e) => setHistoryVisibleCount(Number(e.target.value))}
              className="input-terminal"
              style={{
                padding: "4px 8px",
                fontSize: 12,
                minWidth: 80,
              }}
            >
              <option value={15}>15</option>
              <option value={30}>30</option>
              <option value={50}>50</option>
            </select>
          </div>
        </div>
      </div>

      {filteredOrderHistory.length === 0 ? (
        <div style={{ fontSize: 12, color: "#6b7280", padding: "8px 0" }}>
          {orderHistory.length === 0 
            ? (mineOnly && myOrderIds.size === 0 
                ? "No orders tracked" 
                : (contextIsAuthed ? "No orders yet" : "Sign in to view your order history and cancel orders"))
            : `No ${historyFilter === "all" ? "" : historyFilter} orders`}
        </div>
      ) : (
        <>
          {/* Desktop header row only (we'll hide on mobile in CSS) */}
          <div
            className="history-header"
            style={{
              display: "grid",
              gridTemplateColumns: "100px 60px 70px 55px 55px 60px 100px 1fr 70px",
              gap: 10,
              padding: "8px 10px",
              background: "#0f172a",
              borderRadius: 4,
              marginBottom: 8,
              fontSize: 11,
              fontWeight: 600,
              color: "#9ca3af",
              textTransform: "uppercase",
              letterSpacing: 0.5,
            }}
          >
            <div>ID</div>
            <div>Type</div>
            <div>Price</div>
            <div>Qty</div>
            <div>Filled</div>
            <div>Remain</div>
            <div>Status</div>
            <div>Created</div>
            <div>Action</div>
          </div>

          <div className="panel-scroll" style={{ display: "flex", flexDirection: "column", gap: 4, minHeight: 0, maxHeight: isMobile ? "300px" : "400px", overflowY: "auto" }}>
            {filteredOrderHistory.slice(0, historyVisibleCount).map((o) => (
              <div
                key={o.id}
                className="history-row"
                style={{
                  display: "grid",
                  gridTemplateColumns: "100px 60px 70px 55px 55px 60px 100px 1fr 70px",
                  gap: 10,
                  padding: "8px 10px",
                  background: myOrderIds.has(String(o.id)) ? "#1e3a8a" : "#0f172a",
                  border: myOrderIds.has(String(o.id)) ? "1px solid #3b82f6" : "1px solid #1e293b",
                  borderRadius: 4,
                  fontSize: 12,
                  alignItems: "center",
                  minWidth: 0,
                  position: "relative",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div className="mono-id" style={{ fontFamily: "monospace", color: "#9ca3af" }}>#{o.id}</div>
                  {myOrderIds.has(String(o.id)) && (
                    <span
                      style={{
                        fontSize: 9,
                        padding: "1px 4px",
                        background: "#3b82f6",
                        color: "#ffffff",
                        borderRadius: 3,
                        fontWeight: 700,
                        letterSpacing: 0.5,
                      }}
                    >
                      YOU
                    </span>
                  )}
                </div>
                <div style={{ fontWeight: 600, color: o.type === "buy" ? "#10b981" : "#ef4444" }}>{o.type.toUpperCase()}</div>
                <div style={{ fontFamily: "monospace", color: "#e5e7eb" }}>${o.price}</div>
                {(() => {
                  const qty = o.originalQuantity ?? o.quantity;
                  const remain = o.quantity;
                  const filled = Math.max(0, qty - remain);
                  return (
                    <>
                      <div style={{ color: "#e5e7eb" }}>{Math.floor(qty)}</div>
                      <div style={{ color: "#e5e7eb" }}>{Math.floor(filled)}</div>
                      <div style={{ color: "#e5e7eb" }}>{Math.floor(remain)}</div>
                    </>
                  );
                })()}
                <div><StatusChip status={o.status} /></div>
                <div style={{ fontSize: 11, color: "#6b7280" }}>{formatRelativeTime(o.createdAt)}</div>
                <div>
                  {contextIsAuthed && tradingEnabled && (o.status === "OPEN" || o.status === "PARTIAL") && (
                    <button
                      type="button"
                      onClick={() => handleCancelOrder(o.id)}
                      style={{
                        padding: "3px 8px",
                        fontSize: 11,
                        fontWeight: 600,
                        borderRadius: 4,
                        border: "1px solid #b91c1c",
                        background: "#111827",
                        color: "#fca5a5",
                        cursor: "pointer",
                      }}
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );

  const handleLogoutConfirm = () => {
    setShowLogoutConfirm(false);
    contextLogout();
    // Navigate immediately - natural flow without toast interruption
    navigate("/?loggedOut=true");
  };

  const workspaceMain = contextIsAuthed ? (
    <AuthedView
      tickerData={tickerData}
      isMobile={isMobile}
      err={err}
      successMessage={successMessage}
      setSuccessMessage={setSuccessMessage}
      form={form}
      setForm={setForm}
      submitOrder={submitOrder}
      loading={loading}
      mobileTab={mobileTab}
      setMobileTab={setMobileTab}
      OrderBookPanel={OrderBookPanel}
      TradesPanel={TradesPanel}
      HistoryPanel={HistoryPanel}
      showOrderForm
      onSignInClick={() => navigate("/auth?next=/app")}
      balance={paperState.balance}
      realizedPnL={paperState.realizedPnL}
      positions={displayPositions}
      currentPrice={currentPrice}
      tradingEnabled={tradingEnabled}
      liveAccountReady={paperAccountReady}
      devSimulation={{
        enabled: simulationEnabled,
        onToggle: handleSimulationToggle,
        starting: simulationStarting,
        stopping: simulationStopping,
      }}
    />
  ) : (
    <GuestView
      tickerData={tickerData}
      isMobile={isMobile}
      err={err}
      successMessage={successMessage}
      setSuccessMessage={setSuccessMessage}
      form={form}
      setForm={setForm}
      submitOrder={submitOrder}
      loading={loading}
      mobileTab={mobileTab}
      setMobileTab={setMobileTab}
      OrderBookPanel={OrderBookPanel}
      TradesPanel={TradesPanel}
      HistoryPanel={HistoryPanel}
      showOrderForm={mode !== "demo"}
      onSignInClick={() => navigate("/auth?next=/app")}
      tradingEnabled={false}
    />
  );

  return (
    <div
      className="page-enter trading-dashboard-root"
      style={{ minHeight: "100dvh", background: "#0b0f17", color: "#e5e7eb", width: "100%", maxWidth: "100%", minWidth: 0 }}
    >
      {/* Offline Banner (global) */}
      {isOffline && (
        <div
          style={{
            position: "fixed",
            top: 56,
            left: 0,
            right: 0,
            zIndex: 1100,
            display: "flex",
            justifyContent: "center",
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              background: "#111827",
              border: "1px solid #4b5563",
              color: "#e5e7eb",
              padding: "6px 12px",
              borderRadius: 999,
              fontSize: 12,
              pointerEvents: "auto",
            }}
          >
            You're offline. Reconnecting…
          </div>
        </div>
      )}
      {/* Logout Confirmation Modal */}
      <ConfirmModal
        isOpen={showLogoutConfirm}
        title="Confirm Logout"
        message="Are you sure you want to log out?"
        confirmLabel="Logout"
        cancelLabel="Cancel"
        onConfirm={handleLogoutConfirm}
        onCancel={() => setShowLogoutConfirm(false)}
      />

      {/* Scrolling Ticker Banner */}
      <div
        className="ticker-banner"
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          width: "100%",
          height: "38px",
          background: "#0b0f17",
          borderBottom: "1px solid #1f2937",
          overflow: "hidden",
          zIndex: 1001,
          display: "flex",
          alignItems: "center",
        }}
      >
        <div className="ticker-content">
          <span className="ticker-text">
            DEMO PROJECT A simulated market environment built to study exchange mechanics, order flow, and trading interfaces. All activity is synthetic and for demonstration only.
          </span>
          <span className="ticker-separator"> • </span>
          <span className="ticker-text">
            DEMO PROJECT A simulated market environment built to study exchange mechanics, order flow, and trading interfaces. All activity is synthetic and for demonstration only.
          </span>
          <span className="ticker-separator"> • </span>
          <span className="ticker-text">
            DEMO PROJECT A simulated market environment built to study exchange mechanics, order flow, and trading interfaces. All activity is synthetic and for demonstration only.
          </span>
        </div>
      </div>
      
      {/* Spacer to push content down (ticker banner) */}
      <div style={{ height: 38 }} />
      
      {/* Header Bar */}
      <div
        style={{
          background: "#111827",
          borderBottom: "1px solid #1f2937",
          padding: "8px 12px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 8,
          width: "100%",
        }}
        className="mobile-compact-header"
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
  <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#f9fafb" }}>
    Mini Exchange
  </h1>

  {!contextIsAuthed && (
    <>
      <span
        style={{
          fontSize: 10,
          padding: "2px 6px",
          background: "#78350f",
          color: "#fcd34d",
          border: "1px solid #f59e0b",
          borderRadius: 4,
          fontWeight: 700,
          letterSpacing: 0.5,
        }}
      >
        GUEST
      </span>
      <span style={{ fontSize: 10, color: "#6b7280", fontWeight: 500 }}>DEMO MODE — In-Memory Simulation</span>
    </>
  )}
  
  {contextIsAuthed && contextUser && (
    <span
      style={{
        fontSize: 11,
        padding: "3px 8px",
        background: "#1e3a8a",
        color: "#93c5fd",
        border: "1px solid #3b82f6",
        borderRadius: 4,
        fontWeight: 600,
        letterSpacing: 0.3,
      }}
    >
      {contextUser.email.split("@")[0]}
    </span>
  )}
</div>

        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
            <span style={{ color: "#9ca3af" }}>
              {buy.length} buys • {sell.length} sells • {totalTrades} trades
        </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
  <div
    style={{
      background: marketDot,
      borderRadius: "50%",
      width: 8,
      height: 8,
      animation: headerSimulationActive ? "pulse 1.2s infinite" : "none",
    }}
  />
  <span
    style={{
      fontSize: 12,
      fontWeight: 700,
      color: headerSimulationActive ? "#10b981" : "#9ca3af",
      letterSpacing: 0.5,
      fontFamily: "monospace",
    }}
  >
    {marketStatus}
  </span>

  {/* optional small sync stamp (does NOT replace status) */}
  {lastSyncAt && (
    <span style={{ fontSize: 11, color: "#6b7280", fontFamily: "monospace" }}>
      • {new Date(lastSyncAt).toLocaleTimeString()}
    </span>
  )}

  {/* WebSocket: useMarketWebSocket subscribes to backend feed; wsConnected reflects real socket state */}
  {(simulationEnabled || contextIsAuthed) && (
    <span
      style={{
        fontSize: 10,
        padding: "2px 6px",
        background: wsConnected ? "#065f46" : "#374151",
        color: wsConnected ? "#6ee7b7" : "#9ca3af",
        border: `1px solid ${wsConnected ? "#10b981" : "#4b5563"}`,
        borderRadius: 4,
        fontWeight: 600,
        letterSpacing: 0.3,
        fontFamily: "monospace",
      }}
    >
      WS {wsConnected ? "ON" : "OFF"}
    </span>
  )}
</div>

          {contextIsAuthed ? (
            <>
              <button
                type="button"
                onClick={() => navigate("/")}
                className="btn-secondary"
                style={{ padding: "6px 12px", fontSize: 13 }}
              >
                Home
              </button>
              <button
                type="button"
                onClick={() => setShowLogoutConfirm(true)}
                className="btn-secondary"
                style={{ padding: "6px 12px", fontSize: 13 }}
              >
                Logout
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => navigate("/auth?next=/app")}
              className="btn-secondary"
              style={{ padding: "6px 12px", fontSize: 13 }}
            >
              Sign in
            </button>
          )}

        </div>
      </div>

      <div
        style={{ maxWidth: "100%", margin: "0 auto", padding: "12px", width: "100%", minWidth: 0, boxSizing: "border-box" }}
        className="mobile-compact"
      >
        {workspaceMain}
      </div>

      <style>{`
        .input-terminal {
          background: #0f172a;
          border: 1px solid #1f2937;
          color: #e5e7eb;
          padding: 8px 10px;
          border-radius: 4px;
          font-size: 14px;
          font-family: 'monospace';
          outline: none;
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        .input-terminal:focus {
          border-color: #3b82f6;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
        }
        .input-terminal::placeholder {
          color: #6b7280;
        }

        .btn-primary {
          background: #3b82f6;
          color: #ffffff;
          border: 1px solid #2563eb;
          padding: 8px 16px;
          border-radius: 4px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: background-color 0.2s, border-color 0.2s;
        }
        .btn-primary:hover:not(:disabled) {
          background: #2563eb;
          border-color: #1d4ed8;
        }
        .btn-primary:focus-visible {
          outline: 2px solid #3b82f6;
          outline-offset: 2px;
        }
        .btn-primary:disabled {
          background: #374151;
          border-color: #4b5563;
          color: #9ca3af;
          cursor: not-allowed;
        }

        .btn-secondary {
          background: #374151;
          color: #e5e7eb;
          border: 1px solid #4b5563;
          padding: 6px 12px;
          border-radius: 4px;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          transition: background-color 0.2s, border-color 0.2s;
        }
        .btn-secondary:hover:not(:disabled) {
          background: #4b5563;
          border-color: #6b7280;
        }
        .btn-secondary:focus-visible {
          outline: 2px solid #6b7280;
          outline-offset: 2px;
        }
        .btn-secondary:disabled {
          background: #1f2937;
          border-color: #374151;
          color: #6b7280;
          cursor: not-allowed;
        }

        .btn-danger {
          background: #7f1d1d;
          color: #fca5a5;
          border: 1px solid #ef4444;
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
          transition: background-color 0.2s, border-color 0.2s;
        }
        .btn-danger:hover:not(:disabled) {
          background: #991b1b;
          border-color: #dc2626;
        }
        .btn-danger:focus-visible {
          outline: 2px solid #ef4444;
          outline-offset: 2px;
        }
        .btn-danger:disabled {
          background: #1f2937;
          border-color: #374151;
          color: #6b7280;
          cursor: not-allowed;
        }

        @media (max-width: 767px) {
          .main-grid {
            grid-template-columns: 1fr !important;
            min-width: 0;
            width: 100%;
            max-width: 100%;
          }
          .main-grid-mobile {
            min-width: 0;
            max-width: 100%;
          }
        }
      `}</style>
    </div>
  );
}
