import { useEffect, useState } from "react";

type Order = {
  id: string;
  type: "buy" | "sell";
  price: number;
  quantity: number;
};

type Trade = {
  buyOrderId: string;
  sellOrderId: string;
  price: number;
  quantity: number;
};

const pulse = `
  @keyframes pulse {
    0% { opacity: 1; }
    50% { opacity: 0.3; }
    100% { opacity: 1; }
  }
`;


export default function App() {
  const [orderBook, setOrderBook] = useState<{ buy: Order[]; sell: Order[] }>({
    buy: [],
    sell: [],
  });
  const [trades, setTrades] = useState<Trade[]>([]);
  const [form, setForm] = useState({ type: "buy", price: "", quantity: "" });

  // Fetch book + trades periodically
  useEffect(() => {
    const fetchData = async () => {
      const bookRes = await fetch("http://localhost:4000/api/orders/book");
      const bookData = await bookRes.json();
      setOrderBook(bookData);

      const tradesRes = await fetch("http://localhost:4000/api/orders/trades");
      const tradesData = await tradesRes.json();
      setTrades(tradesData);
    };

    fetchData();
    const interval = setInterval(fetchData, 2000); // refresh every 2s
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = pulse;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  const submitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    await fetch("http://localhost:4000/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: form.type,
        price: Number(form.price),
        quantity: Number(form.quantity),
      }),
    });
    setForm({ type: "buy", price: "", quantity: "" });
  };

  const cancelOrder = async (id: string) => {
    await fetch(`http://localhost:4000/api/orders/${id}`, {
      method: "DELETE",
    });
    // Refresh book and trades after cancel
    const bookRes = await fetch("http://localhost:4000/api/orders/book");
    const bookData = await bookRes.json();
    setOrderBook(bookData);
  };
  
  // --- UI State Helper ---
const isActive = orderBook.buy.length + orderBook.sell.length > 0;


  return (
    <div style={{ padding: 20, fontFamily: "sans-serif" }}>
      <h1>Mini Exchange Dashboard</h1>

      <form onSubmit={submitOrder} style={{ marginBottom: 20 }}>
        <select
          value={form.type}
          onChange={(e) => setForm({ ...form, type: e.target.value })}
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
        />
        <input
          type="number"
          placeholder="Quantity"
          value={form.quantity}
          onChange={(e) => setForm({ ...form, quantity: e.target.value })}
          required
        />
        <button type="submit">Submit Order</button>
      </form>

      <h3>📘 Order Book</h3>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "#f3f4f6",
          padding: "6px 10px",
          borderRadius: 6,
          marginBottom: 10,
          fontSize: 14,
        }}
      >
        <span style={{ color: "#555" }}>
          Active: {orderBook.buy.length} buys • {orderBook.sell.length} sells •{" "}
          {trades.length} trades executed
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
        ></div>
        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: isActive ? "#4caf50" : "#9e9e9e",
            letterSpacing: 0.5,
          }}
        >
          {isActive ? "LIVE" : "IDLE"}
        </span>
      </div>

      </div>


      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: "20px",
          marginTop: "10px",
          marginBottom: "20px",
        }}
      >

      <div style={{ width: "48%" }}>
      <h4 style={{ color: "green" }}>Buy Orders</h4>
      {orderBook.buy.length === 0 && <p>No buys yet</p>}
      {orderBook.buy.map((o) => (
        <div
          key={o.id}
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            background: "#e8f5e9",
            border: "1px solid #c8e6c9",
            padding: "4px 8px",
            marginBottom: 4,
            borderRadius: 4,
          }}
        >
          <div>
            <span style={{ fontWeight: 500 }}>#{o.id}</span>{" "}
            <span>
              {o.quantity} unit{o.quantity !== 1 ? "s" : ""} @ ${o.price}
            </span>
          </div>
          <button
            onClick={() => cancelOrder(o.id)}
            style={{
              background: "#ff5252",
              color: "white",
              border: "none",
              borderRadius: 4,
              padding: "2px 6px",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
        </div>
      ))}
    </div>

    <div style={{ width: "48%" }}>
      <h4 style={{ color: "red" }}>Sell Orders</h4>
      {orderBook.sell.length === 0 && <p>No sells yet</p>}
      {orderBook.sell.map((o) => (
        <div
          key={o.id}
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            background: "#ffebee",
            border: "1px solid #ffcdd2",
            padding: "4px 8px",
            marginBottom: 4,
            borderRadius: 4,
          }}
        >
          <div>
            <span style={{ fontWeight: 500 }}>#{o.id}</span>{" "}
            <span>
              {o.quantity} unit{o.quantity !== 1 ? "s" : ""} @ ${o.price}
            </span>
          </div>
          <button
            onClick={() => cancelOrder(o.id)}
            style={{
              background: "#ff5252",
              color: "white",
              border: "none",
              borderRadius: 4,
              padding: "2px 6px",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
        </div>
      ))}
    </div>
    </div>


      <h2>💥 Trades</h2>
      {trades.length === 0 && <p>No trades yet</p>}
      <ul style={{ listStyle: "none", paddingLeft: 0 }}>
        {trades.map((t, i) => (
          <li
            key={i}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              background: "#f9f9f9",
              borderLeft: "4px solid #4caf50",
              padding: "6px 10px",
              marginBottom: 6,
              borderRadius: 4,
              fontFamily: "monospace",
            }}
          >
            <span>
              🟢 Buy:<b>{t.buyOrderId}</b> → 🔴 Sell:<b>{t.sellOrderId}</b>
            </span>
            <span>
              {t.quantity} unit{t.quantity !== 1 ? "s" : ""} @ ${t.price}
            </span>
          </li>
        ))}
      </ul>

    </div>
  );
}
