import { useEffect, useMemo, useState, useRef } from "react";

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

export default function App() {
  const [orderBook, setOrderBook] = useState<Order[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [orderHistory, setOrderHistory] = useState<Order[]>([]);
  const [form, setForm] = useState({ type: "buy" as "buy" | "sell", price: "", quantity: "" });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [lastTradeId, setLastTradeId] = useState<string | null>(null);
  const flashRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const fetchAllData = async () => {
    try {
      setErr(null);

      const [bookRes, tradesRes, historyRes] = await Promise.all([
        fetch("http://localhost:4000/api/orders/open?limit=200"),
        fetch("http://localhost:4000/api/orders/trades/db?limit=50"),
        fetch("http://localhost:4000/api/orders/history?limit=50"),
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

      const res = await fetch("http://localhost:4000/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: form.type, price, quantity }),
      });

      if (!res.ok) {
        const msg = await res.json().catch(() => null);
        throw new Error(msg?.error || "Order failed");
      }

      setForm({ type: "buy", price: "", quantity: "" });
      await fetchAllData();
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
      const res = await fetch(`http://localhost:4000/api/orders/${id}`, {
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

  return (
    <div style={{ minHeight: "100vh", background: "#0b0f17", color: "#e5e7eb" }}>
      {/* Header Bar */}
      <div
        style={{
          background: "#111827",
          borderBottom: "1px solid #1f2937",
          padding: "12px 20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#f9fafb" }}>
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
        </div>
      </div>

      <div style={{ maxWidth: 1400, margin: "0 auto", padding: "20px" }}>
        {/* Error Banner */}
        {err && (
          <div
            style={{
              background: "#7f1d1d",
              border: "1px solid #ef4444",
              color: "#fca5a5",
              padding: "10px 14px",
              borderRadius: 6,
              marginBottom: 16,
              fontSize: 14,
            }}
          >
            {err}
          </div>
        )}

        {/* Order Form - Compact Ticket */}
        <div
          style={{
            background: "#111827",
            border: "1px solid #1f2937",
            borderRadius: 6,
            padding: "14px 16px",
            marginBottom: 20,
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

        {/* Main Grid Layout */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
            gap: 20,
          }}
          className="main-grid"
        >
          {/* Left: Order Book */}
          <div
            style={{
              background: "#111827",
              border: "1px solid #1f2937",
              borderRadius: 6,
              padding: 16,
            }}
          >
            <h3 style={{ margin: "0 0 12px 0", fontSize: 16, fontWeight: 600, color: "#f9fafb" }}>
              Order Book
            </h3>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {/* BUY Column */}
              <div>
                <h4
                  style={{
                    margin: "0 0 8px 0",
                    fontSize: 13,
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
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {buy.map((o) => (
                      <div
                        key={o.id}
                        style={{
                          background: "#0f172a",
                          border: "1px solid #1e293b",
                          padding: "8px 10px",
                          borderRadius: 4,
                          fontSize: 12,
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            marginBottom: 4,
                          }}
                        >
                          <span style={{ fontFamily: "monospace", color: "#9ca3af" }}>
                            #{o.id}
                          </span>
                          <StatusChip status={o.status} />
                        </div>
                        <div style={{ color: "#e5e7eb", marginBottom: 2 }}>
                          <span style={{ color: "#10b981", fontWeight: 600 }}>
                            {o.quantity}
                          </span>{" "}
                          @ <span style={{ fontFamily: "monospace" }}>${o.price}</span>
                        </div>
                        {o.status === "OPEN" || o.status === "PARTIAL" ? (
                          <button
                            onClick={() => cancelOrder(o.id)}
                            disabled={loading}
                            className="btn-danger"
                            style={{
                              marginTop: 6,
                              padding: "4px 8px",
                              fontSize: 11,
                              width: "100%",
                            }}
                          >
                            Cancel
                          </button>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* SELL Column */}
              <div>
                <h4
                  style={{
                    margin: "0 0 8px 0",
                    fontSize: 13,
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
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {sell.map((o) => (
                      <div
                        key={o.id}
                        style={{
                          background: "#0f172a",
                          border: "1px solid #1e293b",
                          padding: "8px 10px",
                          borderRadius: 4,
                          fontSize: 12,
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            marginBottom: 4,
                          }}
                        >
                          <span style={{ fontFamily: "monospace", color: "#9ca3af" }}>
                            #{o.id}
                          </span>
                          <StatusChip status={o.status} />
                        </div>
                        <div style={{ color: "#e5e7eb", marginBottom: 2 }}>
                          <span style={{ color: "#ef4444", fontWeight: 600 }}>
                            {o.quantity}
                          </span>{" "}
                          @ <span style={{ fontFamily: "monospace" }}>${o.price}</span>
                        </div>
                        {o.status === "OPEN" || o.status === "PARTIAL" ? (
                          <button
                            onClick={() => cancelOrder(o.id)}
                            disabled={loading}
                            className="btn-danger"
                            style={{
                              marginTop: 6,
                              padding: "4px 8px",
                              fontSize: 11,
                              width: "100%",
                            }}
                          >
                            Cancel
                          </button>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right: Trades + Order History (Stacked) */}
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {/* Trades Tape */}
            <div
              style={{
                background: "#111827",
                border: "1px solid #1f2937",
                borderRadius: 6,
                padding: 16,
                flex: "0 0 auto",
              }}
            >
              <h3 style={{ margin: "0 0 12px 0", fontSize: 16, fontWeight: 600, color: "#f9fafb" }}>
                Trades
              </h3>
              {sortedTrades.length === 0 ? (
                <div style={{ fontSize: 12, color: "#6b7280", padding: "8px 0" }}>
                  No trades yet
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 300, overflowY: "auto" }}>
                  {sortedTrades.map((t, i) => {
                    const tradeKey = t.id || t.createdAt || `trade-${i}`;
                    return (
                      <div
                        key={tradeKey}
                        ref={(el) => {
                          if (el) flashRefs.current.set(tradeKey, el);
                        }}
                        style={{
                          background: "#0f172a",
                          borderLeft: "2px solid #1f2937",
                          padding: "8px 10px",
                          borderRadius: 4,
                          fontSize: 12,
                          fontFamily: "monospace",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ color: "#9ca3af" }}>
                            <span style={{ color: "#10b981" }}>B:{t.buyOrderId}</span> →{" "}
                            <span style={{ color: "#ef4444" }}>S:{t.sellOrderId}</span>
                          </span>
                          <span style={{ color: "#e5e7eb" }}>
                            {t.quantity} @ <span style={{ fontWeight: 600 }}>${t.price}</span>
                          </span>
                        </div>
                        {t.createdAt && (
                          <div style={{ fontSize: 11, color: "#6b7280", marginTop: 4 }}>
                            {formatTime(t.createdAt)}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Order History */}
            <div
              style={{
                background: "#111827",
                border: "1px solid #1f2937",
                borderRadius: 6,
                padding: 16,
                flex: "1 1 auto",
                minHeight: 200,
              }}
            >
              <h3 style={{ margin: "0 0 12px 0", fontSize: 16, fontWeight: 600, color: "#f9fafb" }}>
                Order History
              </h3>
              {orderHistory.length === 0 ? (
                <div style={{ fontSize: 12, color: "#6b7280", padding: "8px 0" }}>
                  No orders yet
                </div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <div
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
                    <div>ID</div>
                    <div>Type</div>
                    <div>Price</div>
                    <div>Qty</div>
                    <div>Status</div>
                    <div>Created</div>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 300, overflowY: "auto" }}>
                    {orderHistory.map((o) => (
                      <div
                        key={o.id}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "100px 60px 70px 70px 100px 1fr",
                          gap: 10,
                          padding: "8px 10px",
                          background: "#0f172a",
                          border: "1px solid #1e293b",
                          borderRadius: 4,
                          fontSize: 12,
                          alignItems: "center",
                        }}
                      >
                        <div style={{ fontFamily: "monospace", color: "#9ca3af" }}>#{o.id}</div>
                        <div
                          style={{
                            fontWeight: 600,
                            color: o.type === "buy" ? "#10b981" : "#ef4444",
                          }}
                        >
                          {o.type.toUpperCase()}
                        </div>
                        <div style={{ fontFamily: "monospace", color: "#e5e7eb" }}>${o.price}</div>
                        <div style={{ color: "#e5e7eb" }}>{o.quantity}</div>
                        <div>
                          <StatusChip status={o.status} />
                        </div>
                        <div style={{ fontSize: 11, color: "#6b7280" }}>{formatTime(o.createdAt)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
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

        @media (max-width: 1023px) {
          .main-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}
