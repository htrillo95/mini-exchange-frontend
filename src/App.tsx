import { useEffect, useMemo, useState } from "react";

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

const pulse = `
  @keyframes pulse {
    0% { opacity: 1; }
    50% { opacity: 0.3; }
    100% { opacity: 1; }
  }
`;

function formatTime(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString();
}

function StatusChip({ status }: { status: OrderStatus }) {
  const styles: Record<OrderStatus, React.CSSProperties> = {
    OPEN: { background: "#e3f2fd", color: "#1565c0", border: "1px solid #90caf9" },
    PARTIAL: { background: "#fff8e1", color: "#8d6e63", border: "1px solid #ffe082" },
    FILLED: { background: "#e8f5e9", color: "#2e7d32", border: "1px solid #a5d6a7" },
    CANCELED: { background: "#ffebee", color: "#c62828", border: "1px solid #ef9a9a" },
  };

  return (
    <span
      style={{
        fontSize: 12,
        padding: "2px 8px",
        borderRadius: 999,
        fontWeight: 700,
        letterSpacing: 0.3,
        ...styles[status],
      }}
    >
      {status}
    </span>
  );
}

export default function App() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [form, setForm] = useState({ type: "buy" as "buy" | "sell", price: "", quantity: "" });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Inject pulse CSS once
  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = pulse;
    document.head.appendChild(style);
  
    return () => {
      style.remove(); // ✅ cleanup returns void
    };
  }, []);

  const fetchData = async () => {
    try {
      setErr(null);

      const [ordersRes, tradesRes] = await Promise.all([
        fetch("http://localhost:4000/api/orders/db"),
        fetch("http://localhost:4000/api/orders/trades/db"),
      ]);

      if (!ordersRes.ok) throw new Error("Failed to fetch orders");
      if (!tradesRes.ok) throw new Error("Failed to fetch trades");

      const ordersData = await ordersRes.json();
      const tradesData = await tradesRes.json();

      setOrders(ordersData);
      setTrades(tradesData);
    } catch (e: any) {
      setErr(e?.message || "Something went wrong");
    }
  };

  // Poll DB every 2s
  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 2000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Build “live book” from DB
  const orderBook = useMemo(() => {
    const active = orders.filter(
      (o) => o.quantity > 0 && o.status !== "FILLED" && o.status !== "CANCELED"
    );

    const buy = active
      .filter((o) => o.type === "buy")
      .sort((a, b) => b.price - a.price);

    const sell = active
      .filter((o) => o.type === "sell")
      .sort((a, b) => a.price - b.price);

    return { buy, sell };
  }, [orders]);

  const isActive = orderBook.buy.length + orderBook.sell.length > 0;

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
      await fetchData(); // refresh immediately after submit
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

      await fetchData(); // refresh from DB (IMPORTANT)
    } catch (e: any) {
      setErr(e?.message || "Cancel failed");
    } finally {
      setLoading(false);
    }
  };

  // Order History: newest first
  const orderHistory = useMemo(() => {
    return [...orders].sort((a, b) => {
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return tb - ta;
    });
  }, [orders]);

  // Trades: newest first
  const tradeHistory = useMemo(() => {
    return [...trades].sort((a, b) => {
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return tb - ta;
    });
  }, [trades]);

  return (
    <div style={{ padding: 20, fontFamily: "sans-serif", maxWidth: 1100, margin: "0 auto" }}>
      <h1 style={{ marginBottom: 6 }}>Mini Exchange Dashboard</h1>

      {err && (
        <div
          style={{
            background: "#ffebee",
            border: "1px solid #ef9a9a",
            color: "#b71c1c",
            padding: "8px 10px",
            borderRadius: 6,
            marginBottom: 12,
          }}
        >
          {err}
        </div>
      )}

      <form onSubmit={submitOrder} style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <select
          value={form.type}
          onChange={(e) => setForm({ ...form, type: e.target.value as "buy" | "sell" })}
        >
          <option value="buy">Buy</option>
          <option value="sell">Sell</option>
        </select>

        <input
          type="number"
          placeholder="Price"
          value={form.price}
          onChange={(e) => setForm({ ...form, price: e.target.value })}
          required
          min={0}
        />

        <input
          type="number"
          placeholder="Quantity"
          value={form.quantity}
          onChange={(e) => setForm({ ...form, quantity: e.target.value })}
          required
          min={1}
        />

        <button type="submit" disabled={loading} style={{ cursor: loading ? "not-allowed" : "pointer" }}>
          {loading ? "Working..." : "Submit Order"}
        </button>

        <button
          type="button"
          onClick={fetchData}
          disabled={loading}
          style={{ cursor: loading ? "not-allowed" : "pointer" }}
        >
          Refresh
        </button>
      </form>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "#f3f4f6",
          padding: "8px 10px",
          borderRadius: 6,
          marginBottom: 14,
          fontSize: 14,
        }}
      >
        <span style={{ color: "#555" }}>
          Active: {orderBook.buy.length} buys • {orderBook.sell.length} sells • {trades.length} trades
        </span>

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div
            style={{
              background: isActive ? "#4caf50" : "#9e9e9e",
              borderRadius: "50%",
              width: 10,
              height: 10,
              animation: isActive ? "pulse 1.2s infinite" : "none",
            }}
          />
          <span
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: isActive ? "#2e7d32" : "#757575",
              letterSpacing: 0.5,
            }}
          >
            {isActive ? "LIVE" : "IDLE"}
          </span>
        </div>
      </div>

      {/* ORDER BOOK */}
      <h3 style={{ marginTop: 0 }}>📘 Order Book (Active Only)</h3>

      <div style={{ display: "flex", gap: 16, marginBottom: 18 }}>
        {/* BUY */}
        <div style={{ width: "50%" }}>
          <h4 style={{ color: "green", marginTop: 6 }}>Buy Orders</h4>
          {orderBook.buy.length === 0 && <p>No active buys</p>}

          {orderBook.buy.map((o) => (
            <div
              key={o.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                background: "#e8f5e9",
                border: "1px solid #c8e6c9",
                padding: "6px 10px",
                marginBottom: 6,
                borderRadius: 6,
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontWeight: 700 }}>#{o.id}</span>
                  <StatusChip status={o.status} />
                </div>
                <div style={{ color: "#333" }}>
                  {o.quantity} unit{o.quantity !== 1 ? "s" : ""} @ ${o.price}
                </div>
                {o.createdAt && <div style={{ fontSize: 12, color: "#666" }}>{formatTime(o.createdAt)}</div>}
              </div>

              <button
                onClick={() => cancelOrder(o.id)}
                disabled={loading}
                style={{
                  background: "#ff5252",
                  color: "white",
                  border: "none",
                  borderRadius: 6,
                  padding: "6px 10px",
                  cursor: loading ? "not-allowed" : "pointer",
                }}
              >
                Cancel
              </button>
            </div>
          ))}
        </div>

        {/* SELL */}
        <div style={{ width: "50%" }}>
          <h4 style={{ color: "red", marginTop: 6 }}>Sell Orders</h4>
          {orderBook.sell.length === 0 && <p>No active sells</p>}

          {orderBook.sell.map((o) => (
            <div
              key={o.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                background: "#ffebee",
                border: "1px solid #ffcdd2",
                padding: "6px 10px",
                marginBottom: 6,
                borderRadius: 6,
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontWeight: 700 }}>#{o.id}</span>
                  <StatusChip status={o.status} />
                </div>
                <div style={{ color: "#333" }}>
                  {o.quantity} unit{o.quantity !== 1 ? "s" : ""} @ ${o.price}
                </div>
                {o.createdAt && <div style={{ fontSize: 12, color: "#666" }}>{formatTime(o.createdAt)}</div>}
              </div>

              <button
                onClick={() => cancelOrder(o.id)}
                disabled={loading}
                style={{
                  background: "#ff5252",
                  color: "white",
                  border: "none",
                  borderRadius: 6,
                  padding: "6px 10px",
                  cursor: loading ? "not-allowed" : "pointer",
                }}
              >
                Cancel
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* TRADES */}
      <h3>💥 Trades (DB)</h3>
      {tradeHistory.length === 0 && <p>No trades yet</p>}

      <ul style={{ listStyle: "none", paddingLeft: 0, marginBottom: 22 }}>
        {tradeHistory.map((t, i) => (
          <li
            key={t.id ?? i}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              background: "#f9f9f9",
              borderLeft: "4px solid #4caf50",
              padding: "8px 10px",
              marginBottom: 6,
              borderRadius: 6,
              fontFamily: "monospace",
            }}
          >
            <span>
              🟢 Buy:<b>{t.buyOrderId}</b> → 🔴 Sell:<b>{t.sellOrderId}</b>
            </span>
            <span>
              {t.quantity} unit{t.quantity !== 1 ? "s" : ""} @ ${t.price}
              {t.createdAt ? ` • ${formatTime(t.createdAt)}` : ""}
            </span>
          </li>
        ))}
      </ul>

      {/* ORDER HISTORY */}
      <h3>📜 Order History (DB)</h3>
      {orderHistory.length === 0 && <p>No orders yet</p>}

      <div style={{ border: "1px solid #eee", borderRadius: 8, overflow: "hidden" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "140px 80px 90px 90px 120px 1fr",
            gap: 10,
            padding: "10px 12px",
            background: "#fafafa",
            fontWeight: 800,
            fontSize: 13,
          }}
        >
          <div>ID</div>
          <div>Type</div>
          <div>Price</div>
          <div>Qty</div>
          <div>Status</div>
          <div>Created</div>
        </div>

        {orderHistory.map((o) => (
          <div
            key={o.id}
            style={{
              display: "grid",
              gridTemplateColumns: "140px 80px 90px 90px 120px 1fr",
              gap: 10,
              padding: "10px 12px",
              borderTop: "1px solid #eee",
              fontSize: 13,
              alignItems: "center",
            }}
          >
            <div style={{ fontFamily: "monospace" }}>#{o.id}</div>
            <div style={{ fontWeight: 800, color: o.type === "buy" ? "#2e7d32" : "#c62828" }}>
              {o.type.toUpperCase()}
            </div>
            <div>${o.price}</div>
            <div>{o.quantity}</div>
            <div>
              <StatusChip status={o.status} />
            </div>
            <div style={{ color: "#555" }}>{formatTime(o.createdAt)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}