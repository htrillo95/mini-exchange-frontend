import { useEffect, useRef, useState } from "react";

interface UseSmartPollingOptions {
  enabled: boolean;
  baseIntervalMs?: number;
  maxIntervalMs?: number;
}

type PollFn = (signal: AbortSignal) => Promise<void>;

/**
 * useSmartPolling
 * - Polls only when enabled
 * - Pauses on tab hidden or offline
 * - Exponential backoff on failures
 * - Aborts in-flight requests on pause/unmount
 */
export default function useSmartPolling(
  pollFn: PollFn,
  { enabled, baseIntervalMs = 2000, maxIntervalMs = 10000 }: UseSmartPollingOptions
) {
  const [isOffline, setIsOffline] = useState<boolean>(typeof navigator !== "undefined" ? !navigator.onLine : false);
  const [isHidden, setIsHidden] = useState<boolean>(typeof document !== "undefined" ? document.hidden : false);

  const failureCountRef = useRef(0);
  const timeoutIdRef = useRef<number | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Visibility + online/offline listeners
  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsHidden(document.hidden);
    };

    const handleOnline = () => {
      setIsOffline(false);
    };

    const handleOffline = () => {
      setIsOffline(true);
    };

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", handleVisibilityChange);
    }
    if (typeof window !== "undefined") {
      window.addEventListener("online", handleOnline);
      window.addEventListener("offline", handleOffline);
    }

    return () => {
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", handleVisibilityChange);
      }
      if (typeof window !== "undefined") {
        window.removeEventListener("online", handleOnline);
        window.removeEventListener("offline", handleOffline);
      }
    };
  }, []);

  useEffect(() => {
    const canPoll = enabled && !isOffline && !isHidden;

    // Helper to clear timers and abort in-flight requests
    const clearScheduling = () => {
      if (timeoutIdRef.current !== null) {
        window.clearTimeout(timeoutIdRef.current);
        timeoutIdRef.current = null;
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };

    if (!canPoll) {
      clearScheduling();
      return;
    }

    let cancelled = false;

    const scheduleNext = () => {
      if (cancelled) return;

      const failures = failureCountRef.current;
      let delay = baseIntervalMs;
      if (failures === 1) {
        delay = 5000;
      } else if (failures >= 2) {
        delay = 10000;
      }
      if (delay > maxIntervalMs) delay = maxIntervalMs;

      timeoutIdRef.current = window.setTimeout(async () => {
        // Abort any previous in-flight request
        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
        }
        const controller = new AbortController();
        abortControllerRef.current = controller;

        try {
          await pollFn(controller.signal);
          failureCountRef.current = 0;
        } catch (err: any) {
          // Ignore deliberate aborts
          if (err && err.name === "AbortError") {
            return;
          }
          failureCountRef.current = Math.min(failureCountRef.current + 1, 3);
          // Log for debugging only
          // eslint-disable-next-line no-console
          console.error("Polling error", err);
        }

        scheduleNext();
      }, delay);
    };

    scheduleNext();

    return () => {
      cancelled = true;
      clearScheduling();
    };
  }, [enabled, isOffline, isHidden, baseIntervalMs, maxIntervalMs, pollFn]);

  return { isOffline };
}

