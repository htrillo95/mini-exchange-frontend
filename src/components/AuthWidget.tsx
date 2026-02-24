import React from "react";

type AuthMode = "login" | "register";

export function AuthWidget(props: {
  isAuthed: boolean;
  currentUser: { email: string } | null;

  authMode: AuthMode;
  setAuthMode: (m: AuthMode) => void;

  authEmail: string;
  setAuthEmail: (v: string) => void;

  authPassword: string;
  setAuthPassword: (v: string) => void;

  loading: boolean;
  onSubmit: (e: React.FormEvent) => void;
  onLogout: () => void;
}) {
  const {
    isAuthed,
    currentUser,
    authMode,
    setAuthMode,
    authEmail,
    setAuthEmail,
    authPassword,
    setAuthPassword,
    loading,
    onSubmit,
    onLogout,
  } = props;

  return (
    <div
      style={{
        background: "#111827",
        border: "1px solid #1f2937",
        borderRadius: 6,
        padding: "10px 12px",
        marginBottom: 10,
      }}
    >
      {isAuthed ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ fontSize: 12, color: "#9ca3af", letterSpacing: 0.3 }}>
              Account
            </div>
            <div style={{ fontSize: 13, color: "#e5e7eb" }}>
              <span style={{ fontWeight: 600 }}>
                {currentUser?.email ?? "Logged in"}
              </span>{" "}
              <span style={{ color: "#6b7280", fontFamily: "monospace" }}>
                • live trading enabled
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onLogout}
            className="btn-secondary"
            style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
          >
            Logout
          </button>
        </div>
      ) : (
        <form
          onSubmit={onSubmit}
          style={{
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: "1 1 220px" }}>
            <div style={{ fontSize: 12, color: "#9ca3af", letterSpacing: 0.3 }}>
              Sign in to enable live trading
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => setAuthMode("login")}
                style={{
                  padding: "6px 10px",
                  fontSize: 12,
                  fontWeight: 700,
                  borderRadius: 6,
                  border: "1px solid",
                  borderColor: authMode === "login" ? "#3b82f6" : "#1f2937",
                  background: authMode === "login" ? "#0f172a" : "#111827",
                  color: authMode === "login" ? "#e5e7eb" : "#9ca3af",
                  cursor: "pointer",
                }}
              >
                Login
              </button>

              <button
                type="button"
                onClick={() => setAuthMode("register")}
                style={{
                  padding: "6px 10px",
                  fontSize: 12,
                  fontWeight: 700,
                  borderRadius: 6,
                  border: "1px solid",
                  borderColor: authMode === "register" ? "#3b82f6" : "#1f2937",
                  background: authMode === "register" ? "#0f172a" : "#111827",
                  color: authMode === "register" ? "#e5e7eb" : "#9ca3af",
                  cursor: "pointer",
                }}
              >
                Register
              </button>
            </div>
          </div>

          <input
            value={authEmail}
            onChange={(e) => setAuthEmail(e.target.value)}
            placeholder="Email"
            className="input-terminal"
            type="email"
            required
            style={{ minWidth: 200, flex: "1 1 220px" }}
          />

          <input
            value={authPassword}
            onChange={(e) => setAuthPassword(e.target.value)}
            placeholder="Password"
            className="input-terminal"
            type="password"
            required
            style={{ minWidth: 160, flex: "1 1 180px" }}
          />

          <button
            type="submit"
            disabled={loading}
            className="btn-primary"
            style={{ minWidth: 160 }}
          >
            {loading
              ? "Working..."
              : authMode === "login"
              ? "Login"
              : "Create account"}
          </button>
        </form>
      )}
    </div>
  );
}