import { useEffect, useMemo, useState, useRef } from "react";

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:4000';

type OrderStatus = "OPEN" | "PARTIAL" | "FILLED" | "CANCELED";

type Order = {
  id: string;
  type: "buy" | "sell";
  price: number;
  quantity: number;
  status: OrderStatus;
  createdAt?: string;
};

type Trade = {
  id?: string;
  buyOrderId: string;
  sellOrderId: string;
  price: number;
  quantity: number;
  createdAt?: string;
};

function formatTime(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString();
}

function formatTimeMMSS(iso?: string): string {
  if (!iso) return "--:--";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "--:--";
  const minutes = d.getMinutes().toString().padStart(2, "0");
  const seconds = d.getSeconds().toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function getMidIndex(points: any[]): number {
  if (points.length === 0) return 0;
  return Math.floor((points.length - 1) / 2);
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

function MiniChart({ trades, usedFallback, isMobile }: { trades: Trade[]; usedFallback: boolean; isMobile: boolean }) {
  if (trades.length === 0) return null;

  const prices = trades.map((t) => t.price);
  const width = 800;
  const height = isMobile ? 150 : 220;
  const padding = { top: 15, right: 20, bottom: 40, left: 60 };
  
  // Y-axis ticks: Desktop ~5 ticks, Mobile ~3 ticks
  const yAxisTicks = isMobile ? [0, 0.5, 1] : [0, 0.25, 0.5, 0.75, 1];
  const yAxisFontSize = isMobile ? 10 : 12;

  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const priceRange = maxPrice - minPrice || 1;
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  // Generate path
  const points = prices.map((price, i) => {
    const x = padding.left + (i / (prices.length - 1 || 1)) * chartWidth;
    const y = padding.top + chartHeight - ((price - minPrice) / priceRange) * chartHeight;
    return { x, y, price, trade: trades[i] };
  });

  const pathData = points
    .map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`))
    .join(" ");

  // Time labels: left, middle, right
  const leftTime = points.length > 0 ? formatTimeMMSS(points[0].trade.createdAt) : "--:--";
  const midIndex = getMidIndex(points);
  const midTime = points.length > 0 ? formatTimeMMSS(points[midIndex].trade.createdAt) : "--:--";
  const rightTime = points.length > 0 ? formatTimeMMSS(points[points.length - 1].trade.createdAt) : "--:--";

  return (
    <div>
      <div style={{ width: "100%", overflowX: isMobile ? "auto" : "visible" }}>
        <svg
          width="100%"
          height={height}
          style={{ display: "block" }}
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          className="chart-svg"
        >
          {/* Grid lines - adaptive based on isMobile */}
          {yAxisTicks.map((ratio) => {
            const y = padding.top + chartHeight * (1 - ratio);
            const price = minPrice + priceRange * ratio;
            return (
              <g key={ratio}>
                <line
                  x1={padding.left}
                  y1={y}
                  x2={width - padding.right}
                  y2={y}
                  stroke="#1f2937"
                  strokeWidth={1}
                />
                <text
                  x={padding.left - 12}
                  y={y + 5}
                  fill="#6b7280"
                  fontSize={yAxisFontSize}
                  textAnchor="end"
                  fontFamily="monospace"
                  fontWeight={500}
                >
                  ${price.toFixed(2)}
                </text>
              </g>
            );
          })}

          {/* Price line */}
          <path
            d={pathData}
            fill="none"
            stroke="#10b981"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Data points */}
          {points.map((p, i) => (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r={2}
              fill="#10b981"
              opacity={0.8}
            />
          ))}
        </svg>
      </div>
      
      {/* Time labels - aligned with chart plot area (left: 60px, right: 20px) */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          padding: "8px 20px 0 60px",
          fontSize: 11,
          color: "#6b7280",
          fontFamily: "monospace",
        }}
      >
        <span>{leftTime}</span>
        <span>{midTime}</span>
        <span>{rightTime}</span>
      </div>
    </div>
  );
}

export default function App() {
  const [orderBook, setOrderBook] = useState<Order[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [orderHistory, setOrderHistory] = useState<Order[]>([]);
  const [form, setForm] = useState({ type: "buy" as "buy" | "sell", price: "", quantity: "" });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [myOrderIds, setMyOrderIds] = useState<Set<string>>(new Set());
  const [historyFilter, setHistoryFilter] = useState<"all" | "open" | "filled">("all");
  const [lastTradeId, setLastTradeId] = useState<string | null>(null);
  const flashRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  
  // Demo Mode state (desktop + mobile)
  const [demoMode, setDemoMode] = useState(false);
  const [demoSpeed, setDemoSpeed] = useState<"slow" | "normal" | "fast">("normal");
  const demoIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  // Chart time window state
  const [chartRangeMs, setChartRangeMs] = useState<number | "ALL">("ALL");

  // Mobile layout tab state: which panel is visible on small screens.
  // Desktop ignores this and shows all panels.
  const [mobileTab, setMobileTab] = useState<"book" | "trades" | "history">("book");

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

  const fetchAllData = async () => {
    try {
      setErr(null);

      const [bookRes, tradesRes, historyRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/orders/open?limit=200`),
        fetch(`${API_BASE_URL}/api/orders/trades/db?limit=200`),
        fetch(`${API_BASE_URL}/api/orders/history?limit=50`),
      ]);

      if (!bookRes.ok) throw new Error("Failed to fetch order book");
      if (!tradesRes.ok) throw new Error("Failed to fetch trades");
      if (!historyRes.ok) throw new Error("Failed to fetch order history");

      const bookData = await bookRes.json();
      const tradesData = await tradesRes.json();
      const historyData = await historyRes.json();

      // Defensive filter: quantity > 0
      const filteredBook = bookData.filter((o: Order) => o.quantity > 0);
      setOrderBook(filteredBook);

      // Check for new trades and trigger flash
      if (tradesData.length > 0) {
        const newestTrade = tradesData[0];
        const tradeKey = newestTrade.id || newestTrade.createdAt;
        if (tradeKey && tradeKey !== lastTradeId) {
          setLastTradeId(tradeKey);
          // Trigger flash animation on the newest trade
          setTimeout(() => {
            const element = flashRefs.current.get(tradeKey);
            if (element) {
              element.style.animation = "none";
              setTimeout(() => {
                element.style.animation = "flash 800ms ease-out";
              }, 10);
            }
          }, 100);
        }
      }

      setTrades(tradesData);
      setOrderHistory(historyData);
    } catch (e: any) {
      setErr(e?.message || "Something went wrong");
    }
  };

  // Poll all three endpoints every 2s
  useEffect(() => {
    fetchAllData();
    const interval = setInterval(fetchAllData, 2000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const isActive = buy.length + sell.length > 0;
  const totalTrades = trades.length;

  const submitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErr(null);

    try {
      const price = Number(form.price);
      const quantity = Number(form.quantity);

      if (!form.type || Number.isNaN(price) || Number.isNaN(quantity) || quantity <= 0) {
        setErr("Enter a valid type / price / quantity");
        setLoading(false);
        return;
      }

      const res = await fetch(`${API_BASE_URL}/api/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: form.type, price, quantity }),
      });

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
      if (orderId) {
        setMyOrderIds((prev) => new Set(Array.from(prev).concat(String(orderId))));
      }

      setForm({ type: "buy", price: "", quantity: "" });
      setSuccessMessage(`Order submitted successfully${orderId ? ` (ID: ${orderId})` : ""}`);
      setTimeout(() => setSuccessMessage(null), 4000);
      await fetchAllData();
      
      // Check if order was immediately filled
      setTimeout(async () => {
        await fetchAllData();
        const updatedHistory = await fetch(`${API_BASE_URL}/api/orders/history?limit=50`).then(r => r.json()).catch(() => []);
        if (orderId) {
          const filledOrder = updatedHistory.find((o: Order) => o.id === orderId && o.status === "FILLED");
          if (filledOrder) {
            setSuccessMessage(`Order ${orderId} filled!`);
            setTimeout(() => setSuccessMessage(null), 4000);
          }
        }
      }, 500);
    } catch (e: any) {
      setErr(e?.message || "Submit failed");
    } finally {
      setLoading(false);
    }
  };

  const cancelOrder = async (id: string) => {
    setLoading(true);
    setErr(null);

    try {
      const res = await fetch(`${API_BASE_URL}/api/orders/${id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const msg = await res.json().catch(() => null);
        throw new Error(msg?.message || "Cancel failed");
      }

      await fetchAllData();
    } catch (e: any) {
      setErr(e?.message || "Cancel failed");
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
  const filteredOrderHistory = useMemo(() => {
    if (historyFilter === "all") return orderHistory;
    if (historyFilter === "open") {
      return orderHistory.filter((o) => o.status === "OPEN" || o.status === "PARTIAL");
    }
    if (historyFilter === "filled") {
      return orderHistory.filter((o) => o.status === "FILLED");
    }
    return orderHistory;
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

  // Demo Mode: submit random order
  const submitDemoOrderRef = useRef<(() => Promise<void>) | null>(null);
  
  submitDemoOrderRef.current = async () => {
    try {
      // Compute midpoint from current trades: rolling avg of last 20, or default 10.0
      let midpoint = 10.0;
      if (sortedTrades.length > 0) {
        const recentTrades = sortedTrades.slice(0, 20);
        midpoint = recentTrades.reduce((sum, t) => sum + t.price, 0) / recentTrades.length;
      }

      // Generate random order
      const type = Math.random() < 0.5 ? "buy" : "sell";
      const jitter = (Math.random() - 0.5) * 1.0; // ±0.5
      const price = Math.max(0.01, Math.round((midpoint + jitter) * 100) / 100);
      const quantity = Math.floor(Math.random() * 5) + 1; // 1-5

      const res = await fetch(`${API_BASE_URL}/api/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, price, quantity }),
      });

      if (!res.ok) {
        console.debug("Demo order failed:", await res.text().catch(() => "Unknown error"));
      }
    } catch (e) {
      console.debug("Demo order error:", e);
    }
  };

  // Demo Mode: manage interval
  useEffect(() => {
    if (demoMode) {
      const speeds = { slow: 2500, normal: 1200, fast: 600 };
      const intervalMs = speeds[demoSpeed];

      // Clear any existing interval
      if (demoIntervalRef.current) {
        clearInterval(demoIntervalRef.current);
      }

      demoIntervalRef.current = setInterval(() => {
        submitDemoOrderRef.current?.();
      }, intervalMs);

      return () => {
        if (demoIntervalRef.current) {
          clearInterval(demoIntervalRef.current);
          demoIntervalRef.current = null;
        }
      };
    } else {
      if (demoIntervalRef.current) {
        clearInterval(demoIntervalRef.current);
        demoIntervalRef.current = null;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demoMode, demoSpeed]);

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
                  </div>

                  {(o.status === "OPEN" || o.status === "PARTIAL") && myOrderIds.has(String(o.id)) && (
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
                  </div>

                  {(o.status === "OPEN" || o.status === "PARTIAL") && myOrderIds.has(String(o.id)) && (
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
                    {t.quantity} @ <span style={{ fontWeight: 600 }}>${t.price}</span>
                  </span>
                </div>
                {t.createdAt && (
                  <div style={{ fontSize: 11, color: "#6b7280", marginTop: 4 }}>{formatTime(t.createdAt)}</div>
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
          {orderHistory.length === 0 ? "No orders yet" : `No ${historyFilter === "all" ? "" : historyFilter} orders`}
        </div>
      ) : (
        <>
          {/* Desktop header row only (we'll hide on mobile in CSS) */}
          <div
            className="history-header"
            style={{
              display: "grid",
              gridTemplateColumns: "100px 60px 70px 70px 100px 1fr",
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
            <div>ID</div><div>Type</div><div>Price</div><div>Qty</div><div>Status</div><div>Created</div>
          </div>

          <div className="panel-scroll" style={{ display: "flex", flexDirection: "column", gap: 4, minHeight: 0, maxHeight: isMobile ? "300px" : "400px", overflowY: "auto" }}>
            {filteredOrderHistory.slice(0, historyVisibleCount).map((o) => (
              <div
                key={o.id}
                className="history-row"
                style={{
                  display: "grid",
                  gridTemplateColumns: "100px 60px 70px 70px 100px 1fr",
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
                <div style={{ color: "#e5e7eb" }}>{o.quantity}</div>
                <div><StatusChip status={o.status} /></div>
                <div style={{ fontSize: 11, color: "#6b7280" }}>{formatTime(o.createdAt)}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );

  return (
    <div style={{ minHeight: "100dvh", background: "#0b0f17", color: "#e5e7eb", width: "100%", maxWidth: "100%" }}>
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
        <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#f9fafb" }}>
          Mini Exchange
        </h1>

        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
            <span style={{ color: "#9ca3af" }}>
              {buy.length} buys • {sell.length} sells • {totalTrades} trades
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div
              style={{
                background: isActive ? "#10b981" : "#6b7280",
                borderRadius: "50%",
                width: 8,
                height: 8,
                animation: isActive ? "pulse 1.2s infinite" : "none",
              }}
            />
            <span
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: isActive ? "#10b981" : "#9ca3af",
                letterSpacing: 0.5,
              }}
            >
              {isActive ? "LIVE" : "IDLE"}
            </span>
          </div>

          <button
            type="button"
            onClick={fetchAllData}
            disabled={loading}
            className="btn-secondary"
            style={{
              padding: "6px 12px",
              fontSize: 13,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            Refresh
          </button>

          {/* Demo Mode Controls */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, paddingLeft: 12, borderLeft: "1px solid #1f2937" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={demoMode}
                onChange={(e) => setDemoMode(e.target.checked)}
                style={{ cursor: "pointer" }}
              />
              <span style={{ color: demoMode ? "#fbbf24" : "#9ca3af", fontWeight: demoMode ? 600 : 400 }}>
                Demo Mode
              </span>
            </label>
            {demoMode && (
              <select
                value={demoSpeed}
                onChange={(e) => setDemoSpeed(e.target.value as "slow" | "normal" | "fast")}
                className="input-terminal"
                style={{
                  padding: "4px 8px",
                  fontSize: 12,
                  minWidth: 90,
                }}
              >
                <option value="slow">Slow</option>
                <option value="normal">Normal</option>
                <option value="fast">Fast</option>
              </select>
            )}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: "100%", margin: "0 auto", padding: "12px", width: "100%" }} className="mobile-compact">
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
        {chartTrades.trades.length > 0 && (
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

            {/* Caption */}
            <div
              style={{
                position: "absolute",
                top: 48,
                left: 16,
                fontSize: 11,
                color: "#6b7280",
                zIndex: 1,
                background: "#111827",
                padding: "2px 4px",
                borderRadius: 3,
              }}
            >
              Last {chartTrades.trades.length} trades • Window:{" "}
              {chartRangeMs === "ALL"
                ? "All"
                : chartRangeMs === 1000
                ? "1s"
                : chartRangeMs === 15000
                ? "15s"
                : chartRangeMs === 30000
                ? "30s"
                : chartRangeMs === 60000
                ? "1m"
                : chartRangeMs === 300000
                ? "5m"
                : "Unknown"}
              {chartTrades.usedFallback && " (fallback)"}
            </div>

            <MiniChart trades={chartTrades.trades} usedFallback={chartTrades.usedFallback} isMobile={isMobile} />
          </div>
        )}

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
