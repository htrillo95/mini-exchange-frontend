import { useEffect } from "react";
import TradingDashboard from "../TradingDashboard";
import { useMarketMode } from "../market/MarketModeContext";

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || "http://localhost:4000";

export default function GuestDemo() {
  const { setMarketView } = useMarketMode();

  useEffect(() => {
    setMarketView("demo");
  }, [setMarketView]);

  // Auto-start demo market on mount (if not already running)
  useEffect(() => {
    const startDemoIfNeeded = async () => {
      try {
        // Check current status
        const statusRes = await fetch(`${API_BASE_URL}/api/demo/status`);
        if (statusRes.ok) {
          const statusData = await statusRes.json();
          // Only start if not already running
          if (!statusData?.running) {
            await fetch(`${API_BASE_URL}/api/demo/start`, { method: "POST" });
            // Give TradingDashboard a moment to sync status after start
            setTimeout(() => {
              window.dispatchEvent(new Event("demo-status-changed"));
            }, 500);
          }
        }
      } catch (e) {
        console.debug("Failed to auto-start demo market:", e);
        // Best-effort: ignore errors
      }
    };

    startDemoIfNeeded();
  }, []);

  // Auto-stop demo market on unmount (best-effort, ignore errors)
  useEffect(() => {
    return () => {
      // Cleanup: stop demo market when component unmounts
      fetch(`${API_BASE_URL}/api/demo/stop`, { method: "POST" }).catch(() => {
        // Ignore errors on unmount
      });
    };
  }, []);

  return <TradingDashboard mode="demo" />;
}

