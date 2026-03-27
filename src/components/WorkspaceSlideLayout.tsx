import { useCallback, useEffect, useRef, useState, type ReactNode, type TouchEvent } from "react";

const MOBILE_MAX = 767;

function useWorkspaceMobile(): boolean {
  const [mobile, setMobile] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth <= MOBILE_MAX : false
  );

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_MAX}px)`);
    const update = () => setMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  return mobile;
}

type Props = {
  main: ReactNode;
  aside: ReactNode;
  /** Open the aside slide first (e.g. #workspace-source on mobile). */
  initialMobilePanel?: 0 | 1;
};

/**
 * Desktop (md+): standard two-column workspace shell.
 * Mobile: horizontal slide between main content and aside (“about this project”); swipe or buttons.
 */
export default function WorkspaceSlideLayout({ main, aside, initialMobilePanel = 0 }: Props) {
  const isMobile = useWorkspaceMobile();
  const [panel, setPanel] = useState<0 | 1>(initialMobilePanel);

  useEffect(() => {
    if (!isMobile) setPanel(0);
  }, [isMobile]);

  const touchRef = useRef<{ x: number } | null>(null);
  const onTouchStart = useCallback((e: TouchEvent) => {
    if (e.touches.length !== 1) return;
    touchRef.current = { x: e.touches[0].clientX };
  }, []);
  const onTouchEnd = useCallback(
    (e: TouchEvent) => {
      const start = touchRef.current;
      touchRef.current = null;
      if (!start || e.changedTouches.length !== 1) return;
      const dx = e.changedTouches[0].clientX - start.x;
      const t = 56;
      if (dx > t && panel === 0) setPanel(1);
      else if (dx < -t && panel === 1) setPanel(0);
    },
    [panel]
  );

  if (!isMobile) {
    return (
      <div className="workspace-shell">
        <main className="workspace-main">{main}</main>
        <aside className="workspace-aside">{aside}</aside>
      </div>
    );
  }

  return (
    <div className="workspace-shell workspace-shell--slide">
      <div className="workspace-mobile-panels-outer">
        <div
          className={`workspace-mobile-panels-track ${panel === 1 ? "workspace-mobile-panels-track--1" : ""}`}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          <div className="workspace-mobile-panel-slide">
            <main className="workspace-main workspace-main--slide">
              <header className="workspace-slide-chrome">
                <div className="workspace-slide-chrome-start">
                  <span className="workspace-slide-kicker">Workspace</span>
                </div>
                <div className="workspace-slide-dots" aria-hidden>
                  <span className={panel === 0 ? "is-active" : ""} />
                  <span className={panel === 1 ? "is-active" : ""} />
                </div>
                <div className="workspace-slide-chrome-end">
                  <button
                    type="button"
                    onClick={() => setPanel(1)}
                    className="workspace-slide-pill-btn"
                  >
                    About
                    <span className="workspace-slide-pill-arrow" aria-hidden>
                      →
                    </span>
                  </button>
                </div>
              </header>
              <div className="workspace-slide-body">{main}</div>
            </main>
          </div>
          <div className="workspace-mobile-panel-slide">
            <aside className="workspace-aside workspace-aside--slide">
              <header className="workspace-slide-chrome workspace-slide-chrome--about">
                <div className="workspace-slide-chrome-start">
                  <button type="button" onClick={() => setPanel(0)} className="workspace-slide-back-btn">
                    <span className="workspace-slide-back-icon" aria-hidden>
                      ←
                    </span>
                    Feed
                  </button>
                </div>
                <div className="workspace-slide-dots" aria-hidden>
                  <span className={panel === 0 ? "is-active" : ""} />
                  <span className={panel === 1 ? "is-active" : ""} />
                </div>
                <div className="workspace-slide-chrome-end" aria-hidden>
                  <span className="workspace-slide-chrome-placeholder" />
                </div>
              </header>
              <div className="workspace-slide-body workspace-slide-body--about">{aside}</div>
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}
