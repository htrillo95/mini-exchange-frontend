const FRONTEND_REPO = "https://github.com/htrillo95/mini-exchange-frontend";
const BACKEND_REPO = "https://github.com/htrillo95/mini-exchange-backend";
const LINKEDIN_URL = "https://www.linkedin.com/in/hector-trillo-887718264/";
const EMAIL = "trillo.hector@proton.me";

type Props = {
  /** Right / “about” column: tighter spacing at bottom of aside. */
  placement?: "aside" | "main";
};

/**
 * GitHub repos + contact — workspace aside (right column / second slide).
 */
export default function WorkspaceSourceRepos({ placement = "main" }: Props) {
  const isAside = placement === "aside";

  return (
    <div
      id="workspace-source"
      className={`workspace-source-repos${isAside ? " workspace-source-repos--aside" : ""}`}
      style={isAside ? undefined : { marginTop: 28, paddingTop: 24, borderTop: "1px solid #1f2937" }}
    >
      <div className="workspace-source">
        <div className="workspace-minimal-heading">Source code</div>
        <div className="workspace-minimal-list">
          <a
            href={FRONTEND_REPO}
            target="_blank"
            rel="noopener noreferrer"
            className="workspace-minimal-link"
            title="mini-exchange-frontend — React UI, charts, WebSocket"
          >
            Frontend
          </a>
          <span className="workspace-minimal-sep" aria-hidden>
            ·
          </span>
          <a
            href={BACKEND_REPO}
            target="_blank"
            rel="noopener noreferrer"
            className="workspace-minimal-link"
            title="mini-exchange-backend — API, matching, demo market"
          >
            Backend
          </a>
        </div>
      </div>

      <div className="workspace-contact">
        <div className="workspace-minimal-heading">Contact</div>
        <div className="workspace-minimal-list">
          <a href={`mailto:${EMAIL}`} className="workspace-minimal-link">
            {EMAIL}
          </a>
          <span className="workspace-minimal-sep" aria-hidden>
            ·
          </span>
          <a
            href={LINKEDIN_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="workspace-minimal-link"
          >
            LinkedIn
          </a>
        </div>
      </div>
    </div>
  );
}
