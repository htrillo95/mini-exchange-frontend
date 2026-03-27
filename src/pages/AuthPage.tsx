import { useState, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth, AUTH_SYSTEM_OFFLINE_MESSAGE } from "../auth/AuthContext";
import Toast from "../components/Toast";

// Password validation helpers
function validatePassword(password: string): {
  minLength: boolean;
  hasUpper: boolean;
  hasLower: boolean;
  hasNumber: boolean;
  hasSpecial: boolean;
  isValid: boolean;
} {
  return {
    minLength: password.length >= 8,
    hasUpper: /[A-Z]/.test(password),
    hasLower: /[a-z]/.test(password),
    hasNumber: /[0-9]/.test(password),
    hasSpecial: /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password),
    isValid:
      password.length >= 8 &&
      /[A-Z]/.test(password) &&
      /[a-z]/.test(password) &&
      /[0-9]/.test(password) &&
      /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password),
  };
}

function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export default function AuthPage() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const next = searchParams.get("next") || "/app";

  // Password validation for registration
  const passwordValidation = useMemo(() => {
    if (mode === "register" && password) {
      return validatePassword(password);
    }
    return null;
  }, [password, mode]);

  // Form validation
  const isFormValid = useMemo(() => {
    if (mode === "login") {
      return validateEmail(email) && password.length >= 6;
    } else {
      // Registration: email valid, password valid, confirm password matches
      const pwdValid = passwordValidation?.isValid || false;
      const confirmMatches = password === confirmPassword && confirmPassword.length > 0;
      return validateEmail(email) && pwdValid && confirmMatches;
    }
  }, [email, password, confirmPassword, passwordValidation, mode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log("SUBMIT FIRED", { email, password });
    setError(null);
    setSuccessMessage(null);

    console.log("VALIDATION CHECK", {
      isFormValid,
      email,
      passwordLength: password.length,
    });

    // Client-side validation
    if (!validateEmail(email)) {
      setError("Please enter a valid email address");
      return;
    }

    if (mode === "login") {
      if (password.length < 6) {
        setError("Password must be at least 6 characters");
        return;
      }
    } else {
      // Registration validation
      if (!passwordValidation?.isValid) {
        setError("Password does not meet requirements");
        return;
      }
      if (password !== confirmPassword) {
        setError("Passwords do not match");
        return;
      }
    }

    setLoading(true);

    try {
      if (mode === "login") {
        const shouldNavigate = await login(email, password);
        if (shouldNavigate) {
          navigate(next);
        }
      } else {
        const registrationOk = await register(email, password);
        if (registrationOk) {
          setSuccessMessage("Registration successful! Please sign in.");
          setPassword("");
          setConfirmPassword("");
          setMode("login");
        }
      }
    } catch (e: any) {
      setError(e?.message || `${mode === "login" ? "Login" : "Registration"} failed`);
    } finally {
      setLoading(false);
    }
  };

  const handleModeSwitch = (newMode: "login" | "register") => {
    setMode(newMode);
    setError(null);
    setSuccessMessage(null);
    setPassword("");
    setConfirmPassword("");
    setShowPassword(false);
    setShowConfirmPassword(false);
  };

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
      }}
    >
      {successMessage && (
        <Toast
          message={successMessage}
          type="success"
          duration={5000}
          onClose={() => setSuccessMessage(null)}
        />
      )}

      <button
        type="button"
        onClick={() => navigate("/")}
        style={{
          background: "none",
          border: "none",
          color: "#9ca3af",
          fontSize: 14,
          cursor: "pointer",
          padding: "4px 0",
          marginBottom: 16,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = "#e5e7eb";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = "#9ca3af";
        }}
      >
        ← Back
      </button>

      <div
        style={{
          maxWidth: 400,
          width: "100%",
          background: "#111827",
          border: "1px solid #1f2937",
          borderRadius: 8,
          padding: "24px",
        }}
      >
        <h1
          style={{
            fontSize: 24,
            fontWeight: 700,
            color: "#f9fafb",
            marginBottom: 8,
            textAlign: "center",
          }}
        >
          {mode === "login" ? "Sign In" : "Create Account"}
        </h1>
        <p
          style={{
            fontSize: 14,
            color: "#9ca3af",
            marginBottom: 24,
            textAlign: "center",
          }}
        >
          {mode === "login"
            ? "Sign in to access your trading dashboard"
            : "Create an account to start trading"}
        </p>

        {/* Tab switcher */}
        <div
          style={{
            display: "flex",
            gap: 4,
            marginBottom: 24,
            border: "1px solid #1f2937",
            borderRadius: 6,
            padding: 4,
            background: "#0f172a",
          }}
        >
          <button
            type="button"
            onClick={() => handleModeSwitch("login")}
            style={{
              flex: 1,
              padding: "8px 12px",
              fontSize: 14,
              fontWeight: 600,
              background: mode === "login" ? "#3b82f6" : "transparent",
              color: mode === "login" ? "#ffffff" : "#9ca3af",
              border: "none",
              borderRadius: 4,
              cursor: "pointer",
              transition: "all 0.2s",
            }}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => handleModeSwitch("register")}
            style={{
              flex: 1,
              padding: "8px 12px",
              fontSize: 14,
              fontWeight: 600,
              background: mode === "register" ? "#3b82f6" : "transparent",
              color: mode === "register" ? "#ffffff" : "#9ca3af",
              border: "none",
              borderRadius: 4,
              cursor: "pointer",
              transition: "all 0.2s",
            }}
          >
            Register
          </button>
        </div>

        {/* Error / service notice (503 uses info style — not a harsh failure) */}
        {error && (
          <div
            style={{
              background: error === AUTH_SYSTEM_OFFLINE_MESSAGE ? "#1e3a5f" : "#7f1d1d",
              border: `1px solid ${error === AUTH_SYSTEM_OFFLINE_MESSAGE ? "#3b82f6" : "#ef4444"}`,
              color: error === AUTH_SYSTEM_OFFLINE_MESSAGE ? "#bfdbfe" : "#fca5a5",
              padding: "12px",
              borderRadius: 6,
              marginBottom: 16,
              fontSize: 14,
              lineHeight: 1.5,
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 4 }}>
              {error === AUTH_SYSTEM_OFFLINE_MESSAGE ? "Service notice" : "Error"}
            </div>
            <div>{error}</div>
            {mode === "login" && error.toLowerCase().includes("incorrect") && (
              <div style={{ marginTop: 8, fontSize: 12, opacity: 0.9 }}>
                💡 Tip: Make sure Caps Lock is off and check for typos. If you don't have an account, click "Register" above.
              </div>
            )}
            {mode === "register" && error.toLowerCase().includes("already") && (
              <div style={{ marginTop: 8, fontSize: 12, opacity: 0.9 }}>
                💡 Tip: Click "Sign In" above to log in with this email, or use a different email address.
              </div>
            )}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label
              htmlFor="email"
              style={{
                display: "block",
                fontSize: 14,
                fontWeight: 500,
                color: "#e5e7eb",
                marginBottom: 6,
              }}
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError(null);
              }}
              className="input-terminal"
              placeholder="you@example.com"
              required
              style={{
                width: "100%",
                boxSizing: "border-box",
                borderColor: email && !validateEmail(email) ? "#ef4444" : undefined,
              }}
              disabled={loading}
            />
            {email && !validateEmail(email) && (
              <div style={{ fontSize: 12, color: "#ef4444", marginTop: 4 }}>
                Please enter a valid email address
              </div>
            )}
          </div>

          <div style={{ marginBottom: mode === "register" ? 12 : 24 }}>
            <label
              htmlFor="password"
              style={{
                display: "block",
                fontSize: 14,
                fontWeight: 500,
                color: "#e5e7eb",
                marginBottom: 6,
              }}
            >
              Password
            </label>
            <div style={{ position: "relative" }}>
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError(null);
                }}
                className="input-terminal"
                placeholder={mode === "login" ? "••••••••" : "Enter password"}
                required
                minLength={mode === "login" ? 6 : 8}
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  paddingRight: "40px",
                  borderColor:
                    mode === "register" &&
                    password &&
                    passwordValidation &&
                    !passwordValidation.isValid
                      ? "#ef4444"
                      : undefined,
                }}
                disabled={loading}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: "absolute",
                  right: 8,
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "transparent",
                  border: "none",
                  color: "#9ca3af",
                  cursor: "pointer",
                  padding: "4px",
                  display: "flex",
                  alignItems: "center",
                  fontSize: 16,
                }}
                tabIndex={-1}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? "👁️" : "👁️‍🗨️"}
              </button>
            </div>
            {mode === "login" && password && password.length < 6 && (
              <div style={{ fontSize: 12, color: "#ef4444", marginTop: 4 }}>
                Password must be at least 6 characters
              </div>
            )}
          </div>

          {/* Password validation checklist (registration only) */}
          {mode === "register" && password && passwordValidation && (
            <div
              style={{
                background: "#0f172a",
                border: "1px solid #1f2937",
                borderRadius: 6,
                padding: "12px",
                marginBottom: 16,
                fontSize: 12,
              }}
            >
              <div style={{ color: "#9ca3af", marginBottom: 8, fontWeight: 600 }}>
                Password requirements:
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <div
                  style={{
                    color: passwordValidation.minLength ? "#10b981" : "#6b7280",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <span>{passwordValidation.minLength ? "✓" : "○"}</span>
                  <span>At least 8 characters</span>
                </div>
                <div
                  style={{
                    color: passwordValidation.hasUpper ? "#10b981" : "#6b7280",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <span>{passwordValidation.hasUpper ? "✓" : "○"}</span>
                  <span>One uppercase letter</span>
                </div>
                <div
                  style={{
                    color: passwordValidation.hasLower ? "#10b981" : "#6b7280",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <span>{passwordValidation.hasLower ? "✓" : "○"}</span>
                  <span>One lowercase letter</span>
                </div>
                <div
                  style={{
                    color: passwordValidation.hasNumber ? "#10b981" : "#6b7280",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <span>{passwordValidation.hasNumber ? "✓" : "○"}</span>
                  <span>One number</span>
                </div>
                <div
                  style={{
                    color: passwordValidation.hasSpecial ? "#10b981" : "#6b7280",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <span>{passwordValidation.hasSpecial ? "✓" : "○"}</span>
                  <span>One special character</span>
                </div>
              </div>
            </div>
          )}

          {/* Confirm password (registration only) */}
          {mode === "register" && (
            <div style={{ marginBottom: 24 }}>
              <label
                htmlFor="confirmPassword"
                style={{
                  display: "block",
                  fontSize: 14,
                  fontWeight: 500,
                  color: "#e5e7eb",
                  marginBottom: 6,
                }}
              >
                Confirm Password
              </label>
              <div style={{ position: "relative" }}>
                <input
                  id="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    setError(null);
                  }}
                  className="input-terminal"
                  placeholder="Confirm password"
                  required
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    paddingRight: "40px",
                    borderColor:
                      confirmPassword &&
                      password !== confirmPassword
                        ? "#ef4444"
                        : confirmPassword &&
                          password === confirmPassword
                        ? "#10b981"
                        : undefined,
                  }}
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  style={{
                    position: "absolute",
                    right: 8,
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "transparent",
                    border: "none",
                    color: "#9ca3af",
                    cursor: "pointer",
                    padding: "4px",
                    display: "flex",
                    alignItems: "center",
                    fontSize: 16,
                  }}
                  tabIndex={-1}
                >
                  {showConfirmPassword ? "👁️" : "👁️‍🗨️"}
                </button>
              </div>
              {confirmPassword && password !== confirmPassword && (
                <div style={{ fontSize: 12, color: "#ef4444", marginTop: 4 }}>
                  Passwords do not match
                </div>
              )}
              {confirmPassword &&
                password === confirmPassword &&
                password.length > 0 && (
                  <div style={{ fontSize: 12, color: "#10b981", marginTop: 4 }}>
                    Passwords match
                  </div>
                )}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn-primary"
            style={{
              width: "100%",
              padding: "12px",
              fontSize: 16,
              fontWeight: 600,
            }}
          >
            {loading
              ? "Processing..."
              : mode === "login"
              ? "Sign In"
              : "Create Account"}
          </button>
        </form>

        <style>{`
          .input-terminal {
            background: #0f172a;
            border: 1px solid #1f2937;
            color: #e5e7eb;
            padding: 10px 12px;
            border-radius: 6px;
            font-size: 14px;
            font-family: inherit;
            outline: none;
            transition: border-color 0.2s, box-shadow 0.2s;
          }
          .input-terminal:focus {
            border-color: #3b82f6;
            box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
          }
          .input-terminal:disabled {
            opacity: 0.5;
            cursor: not-allowed;
          }
          .input-terminal::placeholder {
            color: #6b7280;
          }

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
        `}</style>
      </div>
    </div>
  );
}
