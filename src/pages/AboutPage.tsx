import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { articleTimeMs, fetchMarketNews, type MarketNewsArticle } from "../lib/marketNews";
import WorkspaceSlideLayout from "../components/WorkspaceSlideLayout";
import WorkspaceSourceRepos from "../components/WorkspaceSourceRepos";

export default function AboutPage() {
  const { isAuthed } = useAuth();
  const [articles, setArticles] = useState<MarketNewsArticle[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (window.location.hash !== "#workspace-source") return;
    const id = window.setTimeout(() => {
      document.getElementById("workspace-source")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 400);
    return () => clearTimeout(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadNews = async () => {
      if (!cancelled) setLoading(true);
      try {
        const list = await fetchMarketNews(8);
        if (!cancelled) setArticles(list);
      } catch {
        if (!cancelled) setArticles([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    loadNews();
  }, []);

  return (
    <div
      className="page-enter workspace-page"
      style={{ minHeight: "100dvh", background: "#0b0f1a", color: "#e5e7eb", width: "100%", maxWidth: "100%", minWidth: 0 }}
    >
      <WorkspaceSlideLayout
        main={
          <>
            <h1 style={{ margin: "0 0 16px 0", fontSize: 28, fontWeight: 600, color: "#f9fafb" }}>Live Feed</h1>
            {loading && <div style={{ color: "#9ca3af" }}>Loading news...</div>}
            {!loading && articles.length === 0 && <div style={{ color: "#9ca3af" }}>No news available right now</div>}
            {!loading && articles.length > 0 && (
              <div className="workspace-card-list">
                {articles.map((article, idx) => (
                  <a
                    key={String(article.id ?? idx)}
                    href={article.url}
                    target="_blank"
                    rel="noreferrer"
                    className="workspace-card"
                  >
                    <div style={{ color: "#e5e7eb", fontWeight: 500, lineHeight: 1.4, fontSize: 16 }}>
                      {article.headline || article.title || "Untitled"}
                    </div>
                    <div style={{ marginTop: 6, fontSize: 12, color: "#6b7280" }}>
                      <span style={{ color: "#60a5fa" }}>{article.source}</span> •{" "}
                      {new Date(articleTimeMs(article)).toLocaleString()}
                    </div>
                  </a>
                ))}
              </div>
            )}
          </>
        }
        initialMobilePanel={
          typeof window !== "undefined" && window.location.hash === "#workspace-source" ? 1 : 0
        }
        aside={
          <>
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
                Workspace / About
              </span>
              <Link to="/" className="nav-link-animated nav-link-animated--muted">
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
                <li>Displays order book</li>
                <li>Matches buy/sell orders</li>
                <li>Generates trades</li>
                <li>Shows candles and volume</li>
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

            <WorkspaceSourceRepos placement="aside" />
          </>
        }
      />
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
