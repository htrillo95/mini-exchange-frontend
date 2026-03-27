import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  ReactNode,
} from "react";
import { useAuth } from "../auth/AuthContext";

/** Which market surface the user is viewing: demo = watch-only data, live = trading-enabled (when signed in). */
export type MarketView = "demo" | "live";
export type SimulationSpeed = "fast" | "normal";

const STORAGE_VIEW = "marketView";
const STORAGE_MODE_LEGACY = "marketMode";
const STORAGE_SPEED = "simulationSpeed";

interface MarketModeContextType {
  marketView: MarketView;
  setMarketView: (view: MarketView) => void;
  simulationSpeed: SimulationSpeed;
  setSimulationSpeed: (speed: SimulationSpeed) => void;
}

const MarketModeContext = createContext<MarketModeContextType | undefined>(undefined);

function readStoredView(): MarketView | null {
  try {
    const v = localStorage.getItem(STORAGE_VIEW);
    if (v === "demo" || v === "live") return v;
    const legacy = localStorage.getItem(STORAGE_MODE_LEGACY);
    if (legacy === "demo" || legacy === "live") return legacy;
  } catch {
    /* ignore */
  }
  return null;
}

function persistView(view: MarketView) {
  try {
    localStorage.setItem(STORAGE_VIEW, view);
    localStorage.setItem(STORAGE_MODE_LEGACY, view);
  } catch {
    /* ignore */
  }
}

function readStoredSpeed(): SimulationSpeed {
  try {
    const v = localStorage.getItem(STORAGE_SPEED);
    if (v === "fast" || v === "normal") return v;
  } catch {
    /* ignore */
  }
  return "normal";
}

export function MarketModeProvider({ children }: { children: ReactNode }) {
  const { isAuthed, loading: authLoading } = useAuth();

  const [marketView, setMarketViewState] = useState<MarketView>(() => {
    const s = readStoredView();
    return s ?? "demo";
  });

  const [simulationSpeed, setSimulationSpeedState] = useState<SimulationSpeed>(() =>
    readStoredSpeed()
  );

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthed) {
      setMarketViewState("demo");
      setSimulationSpeedState("fast");
      return;
    }
    const stored = readStoredView();
    if (stored === "demo" || stored === "live") {
      setMarketViewState(stored);
    } else {
      setMarketViewState("live");
      persistView("live");
    }
    setSimulationSpeedState(readStoredSpeed());
  }, [authLoading, isAuthed]);

  const setMarketView = useCallback(
    (view: MarketView) => {
      if (!isAuthed && view === "live") return;
      setMarketViewState(view);
      if (isAuthed) {
        persistView(view);
      }
    },
    [isAuthed]
  );

  const setSimulationSpeed = useCallback(
    (speed: SimulationSpeed) => {
      setSimulationSpeedState(speed);
      if (isAuthed) {
        try {
          localStorage.setItem(STORAGE_SPEED, speed);
        } catch {
          /* ignore */
        }
      }
    },
    [isAuthed]
  );

  const effectiveMarketView: MarketView = isAuthed ? marketView : "demo";
  const effectiveSimulationSpeed: SimulationSpeed = isAuthed ? simulationSpeed : "fast";

  const value = useMemo(
    () => ({
      marketView: effectiveMarketView,
      setMarketView,
      simulationSpeed: effectiveSimulationSpeed,
      setSimulationSpeed,
    }),
    [effectiveMarketView, setMarketView, effectiveSimulationSpeed, setSimulationSpeed]
  );

  return (
    <MarketModeContext.Provider value={value}>{children}</MarketModeContext.Provider>
  );
}

export function useMarketMode() {
  const ctx = useContext(MarketModeContext);
  if (!ctx) {
    throw new Error("useMarketMode must be used within a MarketModeProvider");
  }
  return ctx;
}
