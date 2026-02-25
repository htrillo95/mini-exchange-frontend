import { useEffect, useRef, useState, useCallback } from "react";

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || "http://localhost:4000";

// Convert HTTP/HTTPS URL to WebSocket URL
const getWebSocketUrl = (): string => {
  const base = API_BASE_URL.replace(/^http:/, "ws:").replace(/^https:/, "wss:");
  // Remove trailing slash if present
  return base.replace(/\/$/, "");
};

interface MarketUpdateMessage {
  type: "market_update";
  book?: { buy?: unknown[]; sell?: unknown[] } | unknown[];
  trades?: unknown[];
}

interface UseMarketWebSocketOptions {
  enabled: boolean;
  onBook: (book: unknown) => void;
  onTrades: (trades: unknown[]) => void;
}

export default function useMarketWebSocket({
  enabled,
  onBook,
  onTrades,
}: UseMarketWebSocketOptions): { wsConnected: boolean } {
  const [wsConnected, setWsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const onBookRef = useRef(onBook);
  const onTradesRef = useRef(onTrades);

  // Keep callbacks refs updated
  useEffect(() => {
    onBookRef.current = onBook;
    onTradesRef.current = onTrades;
  }, [onBook, onTrades]);

  const connect = useCallback(() => {
    if (!enabled) {
      setWsConnected(false);
      return;
    }

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return; // Already connected
    }

    try {
      const wsUrl = getWebSocketUrl();
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log("[WebSocket] Connected");
        setWsConnected(true);
        reconnectAttemptsRef.current = 0;
        if (reconnectTimeoutRef.current !== null) {
          clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = null;
        }
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as MarketUpdateMessage;
          if (data.type === "market_update") {
            if (data.book) {
              // Normalize book: handle { buy: [], sell: [] } or array format
              const normalizedBook: unknown[] = Array.isArray(data.book)
                ? data.book
                : [...(data.book.buy || []), ...(data.book.sell || [])];
              onBookRef.current(normalizedBook);
            }
            if (data.trades) {
              onTradesRef.current(data.trades);
            }
          }
        } catch (e) {
          console.error("[WebSocket] Failed to parse message", e);
        }
      };

      ws.onerror = (error) => {
        console.error("[WebSocket] Error", error);
      };

      ws.onclose = () => {
        console.log("[WebSocket] Disconnected");
        setWsConnected(false);
        wsRef.current = null;

        // Auto-reconnect with exponential backoff
        if (enabled) {
          const backoffDelays = [1000, 2000, 5000, 10000];
          const delay = backoffDelays[Math.min(reconnectAttemptsRef.current, backoffDelays.length - 1)];
          reconnectAttemptsRef.current += 1;

          reconnectTimeoutRef.current = window.setTimeout(() => {
            connect();
          }, delay);
        }
      };

      wsRef.current = ws;
    } catch (e) {
      console.error("[WebSocket] Failed to create connection", e);
      setWsConnected(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (enabled) {
      connect();
    } else {
      // Disable: close connection and clear reconnect timer
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (reconnectTimeoutRef.current !== null) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      setWsConnected(false);
      reconnectAttemptsRef.current = 0;
    }

    return () => {
      // Cleanup on unmount or when enabled changes
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (reconnectTimeoutRef.current !== null) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };
  }, [enabled, connect]);

  return { wsConnected };
}
