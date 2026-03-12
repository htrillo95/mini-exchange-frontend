import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { createChart, ColorType, UTCTimestamp } from "lightweight-charts";
import { useAuth } from "./auth/AuthContext";
import ConfirmModal from "./components/ConfirmModal";
import useSmartPolling from "./hooks/useSmartPolling";
import useMarketWebSocket from "./hooks/useMarketWebSocket";

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:4000';
// Trigger redeploy

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

/** Convert trades to lightweight-charts format: { time: Unix seconds, value: price }, oldest first */
function tradesToChartData(trades: Trade[]): { time: UTCTimestamp; value: number }[] {
  return trades
    .filter((t) => t.createdAt != null)
    .map((t) => {
      const ms = new Date(t.createdAt!).getTime();
      const time = Number.isNaN(ms) ? 0 : Math.floor(ms / 1000);
      return { time: time as UTCTimestamp, value: t.price };
    })
    .sort((a, b) => a.time - b.time);
}

/** Ensure timestamps are strictly increasing for lightweight-charts (no duplicates allowed). */
function ensureStrictlyIncreasingTimes(
  data: { time: UTCTimestamp; value: number }[]
): { time: UTCTimestamp; value: number }[] {
  const sorted = [...data].sort((a, b) => a.time - b.time);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].time <= sorted[i - 1].time) {
      sorted[i] = { ...sorted[i], time: (sorted[i - 1].time + 1) as UTCTimestamp };
    }
  }
  return sorted;
}

function MiniChart({ trades, usedFallback, isMobile }: { trades: Trade[]; usedFallback: boolean; isMobile: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ReturnType<typeof createChart> | null>(null);
  const seriesRef = useRef<ReturnType<ReturnType<typeof createChart>["addLineSeries"]> | null>(null);

  const chartData = useMemo(() => tradesToChartData(trades), [trades]);

  // Create chart on mount; resize and cleanup on unmount
  useEffect(() => {
    if (!containerRef.current || trades.length === 0) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "#0b1220" },
        textColor: "#94a3b8",
      },
      grid: {
        vertLines: { color: "#1e293b" },
        horzLines: { color: "#1e293b" },
      },
      rightPriceScale: {
        borderColor: "#334155",
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
      timeScale: {
        borderColor: "#334155",
        timeVisible: true,
        secondsVisible: true,
      },
      crosshair: {
        mode: 1,
        vertLine: { color: "#64748b" },
        horzLine: { color: "#64748b" },
      },
      handleScroll: { vertTouchDrag: false },
      width: containerRef.current.clientWidth,
      height: isMobile ? 150 : 220,
    });

    const lineSeries = chart.addLineSeries({
      color: "#22c55e",
      lineWidth: 2,
      priceScaleId: "right",
    });

    chartRef.current = chart;
    seriesRef.current = lineSeries;

    const resizeObserver = new ResizeObserver((entries) => {
      if (!entries.length || !chartRef.current || !containerRef.current) return;
      const { width, height } = containerRef.current.getBoundingClientRect();
      chartRef.current.applyOptions({ width, height });
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [isMobile]);

  // Update series when trade data changes
  useEffect(() => {
    if (!seriesRef.current || chartData.length === 0) return;
    const sorted = ensureStrictlyIncreasingTimes(chartData);
    seriesRef.current.setData(sorted);
    chartRef.current?.timeScale().fitContent();
  }, [chartData]);

  if (trades.length === 0) return null;

  return <div ref={containerRef} style={{ width: "100%", minHeight: isMobile ? 150 : 220 }} />;
}

// Props interface for view components
interface ViewProps {
  tickerData: { lastPrice: number; change: number; changePercent: number; rollingAvg: number };
  chartRangeMs: number | "ALL";
  setChartRangeMs: (value: number | "ALL") => void;
  chartTrades: { trades: Trade[]; usedFallback: boolean };
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
}

function GuestView(props: ViewProps) {
  const {
    tickerData,
    chartRangeMs,
    setChartRangeMs,
    chartTrades,
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

      {/* Mini Line Chart */}
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
        {/* Header with dropdown */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 8,
          }}
        >
          <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#9ca3af" }}>
            Price Trend
          </h3>
          <select
            value={chartRangeMs === "ALL" ? "ALL" : chartRangeMs}
            onChange={(e) => {
              const val = e.target.value;
              setChartRangeMs(val === "ALL" ? "ALL" : Number(val));
            }}
            className="input-terminal"
            style={{
              padding: "4px 8px",
              fontSize: 12,
              minWidth: 100,
            }}
          >
            <option value={1000}>1s</option>
            <option value={15000}>15s</option>
            <option value={30000}>30s</option>
            <option value={60000}>1m</option>
            <option value={300000}>5m</option>
            <option value="ALL">All</option>
          </select>
        </div>

        {/* Body */}
        {chartTrades.trades.length === 0 ? (
          <div style={{ fontSize: 12, color: "#6b7280", padding: "12px 0" }}>
            No trades yet — the chart will appear after the first match.
          </div>
        ) : (
          <MiniChart
            trades={chartTrades.trades}
            usedFallback={chartTrades.usedFallback}
            isMobile={isMobile}
          />
        )}
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
      </div>

      {/* Main Layout: Desktop (2x2 grid) vs Mobile (single panel) */}
      {isMobile ? (
        /* Mobile: Simple block wrapper, render only active panel */
        <div className="main-grid-mobile" style={{ width: "100%" }}>
          {mobileTab === "book" && <OrderBookPanel />}
          {mobileTab === "trades" && <TradesPanel />}
          {mobileTab === "history" && <HistoryPanel />}
        </div>
      ) : (
        /* Desktop: 2x2 grid layout with all panels visible */
        <div
          className="main-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
            gridTemplateRows: "minmax(0, 1fr) minmax(0, 1fr)",
            gap: 12,
            minHeight: 0,
            minWidth: 0,
            width: "100%",
            flex: "1 1 auto",
            overflow: "hidden",
          }}
        >
          <OrderBookPanel />
          <HistoryPanel />
          <TradesPanel />
        </div>
      )}
    </>
  );
}

function AuthedView(props: ViewProps) {
  const {
    tickerData,
    chartRangeMs,
    setChartRangeMs,
    chartTrades,
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

      {/* Mini Line Chart */}
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
        {/* Header with dropdown */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 8,
          }}
        >
          <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#9ca3af" }}>
            Price Trend
          </h3>
          <select
            value={chartRangeMs === "ALL" ? "ALL" : chartRangeMs}
            onChange={(e) => {
              const val = e.target.value;
              setChartRangeMs(val === "ALL" ? "ALL" : Number(val));
            }}
            className="input-terminal"
            style={{
              padding: "4px 8px",
              fontSize: 12,
              minWidth: 100,
            }}
          >
            <option value={1000}>1s</option>
            <option value={15000}>15s</option>
            <option value={30000}>30s</option>
            <option value={60000}>1m</option>
            <option value={300000}>5m</option>
            <option value="ALL">All</option>
          </select>
        </div>

        {/* Body */}
        {chartTrades.trades.length === 0 ? (
          <div style={{ fontSize: 12, color: "#6b7280", padding: "12px 0" }}>
            No trades yet — the chart will appear after the first match.
          </div>
        ) : (
          <MiniChart
            trades={chartTrades.trades}
            usedFallback={chartTrades.usedFallback}
            isMobile={isMobile}
          />
        )}
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
      </div>

      {/* Main Layout: Desktop (2x2 grid) vs Mobile (single panel) */}
      {isMobile ? (
        /* Mobile: Simple block wrapper, render only active panel */
        <div className="main-grid-mobile" style={{ width: "100%" }}>
          {mobileTab === "book" && <OrderBookPanel />}
          {mobileTab === "trades" && <TradesPanel />}
          {mobileTab === "history" && <HistoryPanel />}
        </div>
      ) : (
        /* Desktop: 2x2 grid layout with all panels visible */
        <div
          className="main-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
            gridTemplateRows: "minmax(0, 1fr) minmax(0, 1fr)",
            gap: 12,
            minHeight: 0,
            minWidth: 0,
            width: "100%",
            flex: "1 1 auto",
            overflow: "hidden",
          }}
        >
          <OrderBookPanel />
          <HistoryPanel />
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
  const { isAuthed: contextIsAuthed, user: contextUser, logout: contextLogout, authFetch } = useAuth();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  
  const [orderBook, setOrderBook] = useState<Order[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [orderHistory, setOrderHistory] = useState<Order[]>([]);
  const [form, setForm] = useState({ type: "buy" as "buy" | "sell", price: "", quantity: "" });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const lastErrorRef = useRef<string | null>(null);

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
  // Load myOrderIds from localStorage on mount
  const [myOrderIds, setMyOrderIds] = useState<Set<string>>(() => {
    try {
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
  
  // Save myOrderIds to localStorage whenever it changes
  useEffect(() => {
    try {
      const idsArray = Array.from(myOrderIds);
      localStorage.setItem("myOrderIds", JSON.stringify(idsArray));
    } catch (e) {
      console.error("Failed to save myOrderIds to localStorage", e);
    }
  }, [myOrderIds]);

  const [historyFilter, setHistoryFilter] = useState<"all" | "open" | "filled">("all");
  const [mineOnly, setMineOnly] = useState(false);
  const [lastTradeId, setLastTradeId] = useState<string | null>(null);
  const flashRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  
  // Demo Mode state (desktop + mobile)
  const [demoMode, setDemoMode] = useState(false);
  const [demoStarting, setDemoStarting] = useState(false);
  const [demoStopping, setDemoStopping] = useState(false);
  const marketStatus = demoMode ? "LIVE" : "IDLE";
  const marketDot = demoMode ? "#10b981" : "#6b7280";
  const [demoSpeed, setDemoSpeed] = useState<"slow" | "normal" | "fast">("normal");
  
  // Chart time window state
  const [chartRangeMs, setChartRangeMs] = useState<number | "ALL">(300000); // 5m default

  // Mobile layout tab state: which panel is visible on small screens.
  // Desktop ignores this and shows all panels.
  const [mobileTab, setMobileTab] = useState<"book" | "trades" | "history">("book");
  
  // State for relative time updates (updates every 5 seconds; value triggers re-renders)
  const [, setTimeNow] = useState(Date.now());
  
  useEffect(() => {
    // when demoMode is ON, refresh faster so chart/time labels feel live
    const ms = demoMode ? 1000 : 5000;
  
    const interval = setInterval(() => {
      setTimeNow(Date.now());
    }, ms);
  
    return () => clearInterval(interval);
  }, [demoMode]);

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
    try {
      showError(null);
      const isAuthed = contextIsAuthed;
  
      // history url (only meaningful when authed)
      let historyUrl = `${API_BASE_URL}/api/orders/history?limit=50`;
      if (mineOnly && myOrderIds.size > 0) {
        const idsParam = Array.from(myOrderIds).join(",");
        historyUrl = `${API_BASE_URL}/api/orders/by-ids?ids=${idsParam}`;
      }
  
      const bookUrl = isAuthed
        ? `${API_BASE_URL}/api/orders/open?limit=200` // protected
        : `${API_BASE_URL}/api/orders/book`;          // public
  
      const [bookRes, tradesRes, historyRes] = await Promise.all([
        isAuthed ? authFetch(bookUrl) : fetch(bookUrl),
        fetch(`${API_BASE_URL}/api/orders/trades/db?limit=200`),
        isAuthed ? authFetch(historyUrl) : Promise.resolve(null),
      ]);
  
      if (!bookRes.ok) throw new Error("Failed to fetch order book");
      if (!tradesRes.ok) throw new Error("Failed to fetch trades");
      if (isAuthed && historyRes && !historyRes.ok) throw new Error("Failed to fetch order history");
  
      const bookData = await bookRes.json();
      const tradesData = await tradesRes.json();
      const historyData = isAuthed && historyRes ? await historyRes.json() : [];
  
      // If guest + /book returns {buy:[], sell:[]}, flatten to one array like your UI expects
      const normalizedBook: Order[] = Array.isArray(bookData)
        ? bookData
        : [...(bookData.buy || []), ...(bookData.sell || [])];
  
      const filteredBook = normalizedBook.filter((o: Order) => o.quantity > 0);
      setOrderBook(filteredBook);
  
      // flash logic (unchanged)
      if (tradesData.length > 0) {
        const newestTrade = tradesData[0];
        const tradeKey = newestTrade.id || newestTrade.createdAt;
        if (tradeKey && tradeKey !== lastTradeId) {
          setLastTradeId(tradeKey);
  
          const buyPrices = filteredBook.filter((o: Order) => o.type === "buy").map((o: Order) => o.price);
          const sellPrices = filteredBook.filter((o: Order) => o.type === "sell").map((o: Order) => o.price);
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
  
      setTrades(tradesData);
      setOrderHistory(historyData)
      setLastSyncAt(Date.now());
    } catch (e: any) {
      let message = e?.message || "Something went wrong";
      if (typeof message === "string" && message.includes("Failed to fetch")) {
        console.error("Network error while fetching market data", e);
        message = "Unable to reach the exchange API. Please check your connection or try again shortly.";
      }
      showError(message);
    }
  };

  // Poll all endpoints every 2s (regardless of demoMode).
  // Initial fetch whenever filters change (mineOnly / myOrderIds) – always run once.
  useEffect(() => {
    fetchAllData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mineOnly, myOrderIds.size]);

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

  // WebSocket: enabled when demoMode or authed
  const { wsConnected } = useMarketWebSocket({
    enabled: demoMode || contextIsAuthed,
    onBook: handleBookUpdate,
    onTrades: handleTradesUpdate,
  });

  // Smart polling: only when demoMode or authed, and WS is not connected (fallback)
  const { isOffline } = useSmartPolling(fetchAllData, {
    enabled: (demoMode || contextIsAuthed) && !wsConnected,
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

      const isAuthed = contextIsAuthed;

      const endpoint = isAuthed
        ? `${API_BASE_URL}/api/orders`
        : `${API_BASE_URL}/api/orders/demo`;

      const commonInit: RequestInit = {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ type: form.type, price, quantity }),
      };

      const res = isAuthed
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
      
      // Track user's order ID (only real backend IDs, normalized to string)
      if (orderId && isAuthed) {
        setMyOrderIds((prev) => new Set(Array.from(prev).concat(String(orderId))));
      }

      setForm({ type: "buy", price: "", quantity: "" });
      setSuccessMessage(`Order submitted successfully${orderId ? ` (ID: ${orderId})` : ""}`);
      setTimeout(() => setSuccessMessage(null), 4000);
      await fetchAllData();
      
      // Check if order was immediately filled (auth users only)
      setTimeout(async () => {
        if (!contextIsAuthed) return; // <-- prevents guest 401

        await fetchAllData();

        const updatedHistory = await authFetch(
          `${API_BASE_URL}/api/orders/history?limit=50`
        )
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
      if (typeof message === "string" && message.includes("Failed to fetch")) {
        console.error("Network error while submitting order", e);
        message = "Unable to reach the exchange API. Please try again in a moment.";
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
      const res = await authFetch(`${API_BASE_URL}/api/orders/${id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const msg = await res.json().catch(() => null);
        throw new Error(msg?.message || "Cancel failed");
      }

      await fetchAllData();
    } catch (e: any) {
      let message = e?.message || "Cancel failed";
      if (typeof message === "string" && message.includes("Failed to fetch")) {
        console.error("Network error while cancelling order", e);
        message = "Unable to reach the exchange API. Please try again in a moment.";
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

  // Chart trades: filtered by time window with fallback
  const chartTrades = useMemo(() => {
    let filtered: Trade[] = [];
    let usedFallback = false;

    if (chartRangeMs === "ALL") {
      // Use last 50 trades
      filtered = sortedTrades.slice(0, 50);
    } else {
      // Filter by time window (exclude trades without createdAt)
      const now = Date.now();
      filtered = sortedTrades.filter((t) => {
        if (!t.createdAt) return false;
        const tradeTime = new Date(t.createdAt).getTime();
        if (Number.isNaN(tradeTime)) return false;
        return tradeTime >= now - chartRangeMs;
      });

      // Fallback to last 5 if filtered result is empty
      if (filtered.length === 0) {
        filtered = sortedTrades.slice(0, 5);
        usedFallback = true;
      }
    }

    // Cap at 50 max
    filtered = filtered.slice(0, 50);

    // Reverse to oldest→newest for rendering
    return {
      trades: [...filtered].reverse(),
      usedFallback,
    };
  }, [sortedTrades, chartRangeMs]);

  // Sync demo status on mount and when status changes
  useEffect(() => {
    const syncDemoStatus = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/demo/status`);
        if (res.ok) {
          const data = await res.json();
          if (data?.running !== undefined) {
            setDemoMode(data.running);
          }
        }
      } catch (e) {
        console.debug("Failed to sync demo status:", e);
      }
    };
    
    syncDemoStatus();
    
    // Listen for status change events (from GuestDemo auto-start)
    const handleStatusChange = () => {
      syncDemoStatus();
    };
    window.addEventListener("demo-status-changed", handleStatusChange);
    
    return () => {
      window.removeEventListener("demo-status-changed", handleStatusChange);
    };
  }, []);

  // Handle demo mode toggle via backend API
  const handleDemoModeToggle = async (checked: boolean) => {
    const previousValue = demoMode;
    
    // Optimistically update UI
    setDemoMode(checked);
    
    try {
      if (checked) {
        setDemoStarting(true);
        const res = contextIsAuthed
          ? await authFetch(`${API_BASE_URL}/api/demo/start`, { method: "POST" })
          : await fetch(`${API_BASE_URL}/api/demo/start`, { method: "POST" });
        
        if (!res.ok) {
          const msg = await res.json().catch(() => null);
          throw new Error(msg?.error || "Failed to start demo mode");
        }
      } else {
        setDemoStopping(true);
        const res = contextIsAuthed
          ? await authFetch(`${API_BASE_URL}/api/demo/stop`, { method: "POST" })
          : await fetch(`${API_BASE_URL}/api/demo/stop`, { method: "POST" });
        
        if (!res.ok) {
          const msg = await res.json().catch(() => null);
          throw new Error(msg?.error || "Failed to stop demo mode");
        }
      }
    } catch (e: any) {
      // Revert checkbox on error
      setDemoMode(previousValue);
      showError(e?.message || "Failed to toggle demo mode. Please try again.");
    } finally {
      setDemoStarting(false);
      setDemoStopping(false);
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
        ...(isMobile ? {} : { gridColumn: "1 / 2", gridRow: "1 / span 2" }),
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

                  {contextIsAuthed && (o.status === "OPEN" || o.status === "PARTIAL") && myOrderIds.has(String(o.id)) && (
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

                  {contextIsAuthed && (o.status === "OPEN" || o.status === "PARTIAL") && myOrderIds.has(String(o.id)) && (
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
        ...(isMobile ? {} : { gridColumn: "2 / 3", gridRow: "2 / 3" }),
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
              gridTemplateColumns: "100px 60px 70px 55px 55px 60px 100px 1fr",
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
            <div>ID</div><div>Type</div><div>Price</div><div>Qty</div><div>Filled</div><div>Remain</div><div>Status</div><div>Created</div>
          </div>

          <div className="panel-scroll" style={{ display: "flex", flexDirection: "column", gap: 4, minHeight: 0, maxHeight: isMobile ? "300px" : "400px", overflowY: "auto" }}>
            {filteredOrderHistory.slice(0, historyVisibleCount).map((o) => (
              <div
                key={o.id}
                className="history-row"
                style={{
                  display: "grid",
                  gridTemplateColumns: "100px 60px 70px 55px 55px 60px 100px 1fr",
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

  return (
    <div style={{ minHeight: "100dvh", background: "#0b0f17", color: "#e5e7eb", width: "100%", maxWidth: "100%" }}>
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
      animation: demoMode ? "pulse 1.2s infinite" : "none",
    }}
  />
  <span
    style={{
      fontSize: 12,
      fontWeight: 700,
      color: demoMode ? "#10b981" : "#9ca3af",
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

  {/* WebSocket status chip */}
  {(demoMode || contextIsAuthed) && (
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
            <button
              type="button"
              onClick={() => setShowLogoutConfirm(true)}
              className="btn-secondary"
              style={{ padding: "6px 12px", fontSize: 13 }}
            >
              Logout
            </button>
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

          {/* Demo Mode Controls */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, paddingLeft: 12, borderLeft: "1px solid #1f2937" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: demoStarting || demoStopping ? "not-allowed" : "pointer" }}>
              <input
                type="checkbox"
                checked={demoMode}
                onChange={(e) => handleDemoModeToggle(e.target.checked)}
                disabled={demoStarting || demoStopping}
                style={{ cursor: demoStarting || demoStopping ? "not-allowed" : "pointer", opacity: demoStarting || demoStopping ? 0.5 : 1 }}
              />
              <span style={{ color: demoMode ? "#fbbf24" : "#9ca3af", fontWeight: demoMode ? 600 : 400 }}>
                Simulate Market (Bots/Demo Mode)
                {demoStarting && " (Starting…)"}
                {demoStopping && " (Stopping…)"}
              </span>
            </label>
            {demoMode && (
              <select
                value={demoSpeed}
                onChange={(e) => setDemoSpeed(e.target.value as "slow" | "normal" | "fast")}
                className="input-terminal"
                disabled={demoStarting || demoStopping}
                style={{
                  padding: "4px 8px",
                  fontSize: 12,
                  minWidth: 90,
                  opacity: demoStarting || demoStopping ? 0.5 : 1,
                }}
              >
                <option value="slow">Slow</option>
                <option value="normal">Normal</option>
                <option value="fast">Fast</option>
              </select>
            )}
            {mode === "demo" && (
              <span style={{ fontSize: 11, color: "#6b7280", fontStyle: "italic" }}>
                Demo market managed automatically on this page
              </span>
            )}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: "100%", margin: "0 auto", padding: "12px", width: "100%" }} className="mobile-compact">
        {contextIsAuthed ? (
          <AuthedView
            tickerData={tickerData}
            chartRangeMs={chartRangeMs}
            setChartRangeMs={setChartRangeMs}
            chartTrades={chartTrades}
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
            showOrderForm={mode === "full"}
            onSignInClick={() => navigate("/auth?next=/app")}
          />
        ) : (
          <GuestView
            tickerData={tickerData}
            chartRangeMs={chartRangeMs}
            setChartRangeMs={setChartRangeMs}
            chartTrades={chartTrades}
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
            showOrderForm={mode === "demo" ? false : true}
            onSignInClick={() => navigate("/auth?next=/app")}
          />
        )}
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
          }
        }
      `}</style>
    </div>
  );
}
