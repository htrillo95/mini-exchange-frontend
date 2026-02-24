import { useNavigate, useSearchParams } from "react-router-dom";
import { useEffect, useState } from "react";
import Toast from "../components/Toast";

export default function GuestHome() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [logoutToast, setLogoutToast] = useState(false);

  // Show logout success message if coming from logout
  useEffect(() => {
    if (searchParams.get("loggedOut") === "true") {
      setLogoutToast(true);
      // Remove query param from URL
      searchParams.delete("loggedOut");
      setSearchParams(searchParams, { replace: true });
      // Auto-dismiss after 3 seconds
      setTimeout(() => setLogoutToast(false), 3000);
    }
  }, [searchParams, setSearchParams]);

  return (
    <div
      style={{
        minHeight: "100dvh",
        background: "#0b0f17",
        color: "#e5e7eb",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
        textAlign: "center",
      }}
    >
      {logoutToast && (
        <Toast
          message="Logged out successfully"
          type="success"
          duration={3000}
          onClose={() => setLogoutToast(false)}
        />
      )}
      <div
        style={{
          maxWidth: 600,
          width: "100%",
        }}
      >
        <h1
          style={{
            fontSize: 32,
            fontWeight: 700,
            color: "#f9fafb",
            marginBottom: 16,
          }}
        >
          Mini Exchange
        </h1>
        <p
          style={{
            fontSize: 16,
            color: "#9ca3af",
            marginBottom: 32,
            lineHeight: 1.6,
          }}
        >
          A simulated market environment built to study exchange mechanics, order flow, and trading interfaces. All activity is synthetic and for demonstration only.
        </p>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 12,
            alignItems: "stretch",
          }}
        >
          <button
            onClick={() => navigate("/demo")}
            className="btn-primary"
            style={{
              padding: "12px 24px",
              fontSize: 16,
              fontWeight: 600,
              width: "100%",
            }}
          >
            Enter Exchange (Demo)
          </button>
          <button
            onClick={() => navigate("/auth?next=/app")}
            className="btn-secondary"
            style={{
              padding: "12px 24px",
              fontSize: 16,
              fontWeight: 600,
              width: "100%",
            }}
          >
            Sign in
          </button>
        </div>
      </div>

      <style>{`
        .btn-primary {
          background: #3b82f6;
          color: #ffffff;
          border: 1px solid #2563eb;
          border-radius: 6px;
          cursor: pointer;
          transition: background-color 0.2s, border-color 0.2s;
        }
        .btn-primary:hover:not(:disabled) {
          background: #2563eb;
          border-color: #1d4ed8;
        }
        .btn-primary:focus-visible {
          outline: 2px solid #3b82f6;
          outline-offset: 2px;
        }
        .btn-primary:disabled {
          background: #374151;
          border-color: #4b5563;
          color: #9ca3af;
          cursor: not-allowed;
        }

        .btn-secondary {
          background: #374151;
          color: #e5e7eb;
          border: 1px solid #4b5563;
          border-radius: 6px;
          cursor: pointer;
          transition: background-color 0.2s, border-color 0.2s;
        }
        .btn-secondary:hover:not(:disabled) {
          background: #4b5563;
          border-color: #6b7280;
        }
        .btn-secondary:focus-visible {
          outline: 2px solid #6b7280;
          outline-offset: 2px;
        }
        .btn-secondary:disabled {
          background: #1f2937;
          border-color: #374151;
          color: #6b7280;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
}
