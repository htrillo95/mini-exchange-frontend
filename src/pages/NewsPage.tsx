import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

type NewsItem = {
  id?: string | number;
  headline?: string;
  title?: string;
  source: string;
  datetime?: number;
  publishedAt?: number;
  url: string;
  image?: string;
};

export default function NewsPage() {
  const { isAuthed } = useAuth();
  const [articles, setArticles] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadNews = async () => {
      if (!cancelled) setLoading(true);
      try {
        const res = await fetch(
          "https://finnhub.io/api/v1/news?category=general&token=d72ugfhr01qn7f070etgd72ugfhr01qn7f070eu0"
        );
        if (!res.ok) throw new Error("Failed");
        const data = await res.json();
        console.log(data);
        if (!cancelled) {
          const list: NewsItem[] = Array.isArray(data) ? data.slice(0, 10) : [];
          setArticles(list);
          setLastUpdated(new Date());
          setError(false);
        }
      } catch {
        if (!cancelled) {
          setError(true);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadNews();
    const interval = setInterval(loadNews, 60000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return (
    <div style={{ minHeight: "100dvh", background: "#0b0f1a", color: "#e5e7eb" }}>
      <div style={{ display: "flex", maxWidth: 1320, margin: "0 auto", minHeight: "100dvh" }}>
        <div
          style={{
            width: "68%",
            borderRight: "1px solid #1f2937",
            overflowY: "auto",
            padding: "36px 28px",
          }}
        >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 16 }}>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 600, color: "#f9fafb" }}>Market News</h1>
          <div style={{ fontSize: 12, color: "#6b7280" }}>
            Updated: {lastUpdated ? lastUpdated.toLocaleTimeString() : "—"}
          </div>
        </div>

        {loading && <div style={{ color: "#9ca3af", lineHeight: 1.6 }}>Loading news...</div>}
        {error && <div style={{ color: "#fca5a5" }}>Failed to load news</div>}
        {!loading && !error && articles.length === 0 && (
          <div style={{ color: "#9ca3af", lineHeight: 1.6 }}>No news available right now</div>
        )}

        {!loading && !error && articles.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {articles.map((article, idx) => (
              <a
                key={String(article.id ?? idx)}
                href={article.url}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: "block",
                  background: "#0f172a",
                  border: "1px solid #1f2937",
                  borderRadius: 10,
                  padding: "12px 14px",
                  textDecoration: "none",
                  transition: "all 0.2s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "#4b5563";
                  e.currentTarget.style.background = "#111827";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "#1f2937";
                  e.currentTarget.style.background = "#0f172a";
                }}
              >
                <div style={{ color: "#e5e7eb", fontWeight: 500, lineHeight: 1.4, fontSize: 16 }}>
                  {article.headline || article.title || "Untitled"}
                </div>
                <div style={{ marginTop: 6, fontSize: 12, color: "#6b7280" }}>
                  <span style={{ color: "#60a5fa" }}>{article.source}</span> •{" "}
                  {new Date((article.datetime ?? article.publishedAt ?? Date.now() / 1000) * 1000).toLocaleString()}
                </div>
              </a>
            ))}
          </div>
        )}
      </div>

      <div style={{ width: "32%", padding: "36px 28px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
          <span
            style={{
              fontSize: 10,
              letterSpacing: 0.5,
              textTransform: "uppercase",
              color: "#9ca3af",
              border: "1px solid #1f2937",
              background: "#111827",
              borderRadius: 999,
              padding: "4px 10px",
            }}
          >
            Workspace / News
          </span>
          <Link to="/" style={{ color: "#9ca3af", textDecoration: "none", fontSize: 13 }}>
            Home
          </Link>
        </div>

        <h2 style={{ margin: "0 0 12px 0", fontSize: 28, fontWeight: 600, color: "#f9fafb" }}>Mini Exchange</h2>
        <p style={{ margin: "0 0 20px 0", color: "#9ca3af", lineHeight: 1.65, fontSize: 14 }}>
          Simulated market UI for observing order flow, trade activity, and live chart behavior.
        </p>

        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 10 }}>Features</div>
          <ul style={{ margin: 0, paddingLeft: 18, color: "#9ca3af", fontSize: 14, lineHeight: 1.8 }}>
            <li>Order book and trade feed</li>
            <li>Candlestick + volume chart</li>
            <li>Auth, positions, and balance</li>
          </ul>
        </div>

        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 10 }}>Status</div>
          <div style={{ display: "grid", rowGap: 8, fontSize: 14, color: "#9ca3af" }}>
            <div style={{ display: "grid", gridTemplateColumns: "56px 1fr", alignItems: "center", columnGap: 8 }}>
              <span style={{ color: "#6b7280" }}>Live</span>
              <span><span className="status-dot" style={{ color: "#22c55e" }}>●</span> Market running</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "56px 1fr", alignItems: "center", columnGap: 8 }}>
              <span style={{ color: "#6b7280" }}>Mode</span>
              <span>{isAuthed ? "Signed in" : "Demo"}</span>
            </div>
          </div>
        </div>

        <p style={{ margin: 0, fontSize: 12, color: "#6b7280", lineHeight: 1.7 }}>
          This project explores how trading systems behave through real-time interaction.
        </p>
      </div>
      </div>
      <style>{`
        @keyframes status-pulse {
          0% { opacity: 0.5; }
          50% { opacity: 1; }
          100% { opacity: 0.5; }
        }
        .status-dot {
          display: inline-block;
          animation: status-pulse 1.8s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
