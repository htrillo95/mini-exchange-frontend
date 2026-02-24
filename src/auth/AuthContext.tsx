import { createContext, useContext, useState, useEffect, ReactNode } from "react";

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:4000';

interface User {
  email: string;
}

interface AuthContextType {
  token: string | null;
  user: User | null;
  isAuthed: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refreshMe: () => Promise<void>;
  loading: boolean;
  authFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  sessionNotice: string | null;
  setSessionNotice: (value: string | null) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => {
    return localStorage.getItem("token");
  });
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);

  const isAuthed = Boolean(token);

  const handleUnauthorized = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem("token");
    setSessionNotice("Session expired. Please sign in again.");
  };

  // Load user on mount if token exists
  useEffect(() => {
    if (token) {
      refreshMe().finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist token to localStorage whenever it changes
  useEffect(() => {
    if (token) {
      localStorage.setItem("token", token);
    } else {
      localStorage.removeItem("token");
    }
  }, [token]);

  const refreshMe = async () => {
    if (!token) {
      setUser(null);
      return;
    }

    try {
      const res = await fetch(`${API_BASE_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        if (data?.user?.email) {
          setUser({ email: data.user.email });
        }
      } else if (res.status === 401) {
        // Token invalid, clear everything and surface session expiry
        handleUnauthorized();
      }
    } catch (e) {
      console.error("Failed to refresh user", e);
      // On network error, don't clear token (might be temporary)
    }
  };

  const authFetch: AuthContextType["authFetch"] = async (input, init) => {
    const headers = new Headers((init && init.headers) || undefined);
    if (token && !headers.has("Authorization")) {
      headers.set("Authorization", `Bearer ${token}`);
    }

    const response = await fetch(input, {
      ...init,
      headers,
    });

    if (response.status === 401) {
      // Any protected call returning 401 should behave as session expiry
      handleUnauthorized();
    }

    return response;
  };

  const login = async (email: string, password: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const msg = await res.json().catch(() => null);
        const errorMsg = msg?.error || "Login failed";
        
        // Standardize error messages with helpful guidance
        if (res.status === 401 || errorMsg.toLowerCase().includes("invalid") || errorMsg.toLowerCase().includes("incorrect")) {
          throw new Error("The email or password you entered is incorrect. Please check your credentials and try again, or click 'Register' to create a new account.");
        }
        if (res.status === 404) {
          throw new Error("Account not found. Please check your email address or click 'Register' to create a new account.");
        }
        if (res.status >= 500) {
          throw new Error("Server unavailable. Please try again in a few moments.");
        }
        throw new Error(errorMsg);
      }

      const data = await res.json();
      if (data?.token) {
        setToken(data.token);
        const userEmail = data?.user?.email || email;
        setUser({ email: userEmail });
      } else {
        throw new Error("No token received");
      }
    } catch (e: any) {
      // Re-throw with clean error message
      if (e.message && !e.message.includes("Failed to fetch")) {
        throw e;
      }
      throw new Error("Unable to connect to the server. Please check your internet connection and try again.");
    }
  };

  const register = async (email: string, password: string) => {
    const res = await fetch(`${API_BASE_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      const msg = await res.json().catch(() => null);
      const errorMsg = msg?.error || "Registration failed";
      
      // Standardize error messages with helpful guidance
      if (errorMsg.toLowerCase().includes("already") || errorMsg.toLowerCase().includes("exists") || res.status === 409) {
        throw new Error("This email is already registered. Please sign in instead, or use a different email address.");
      }
      if (res.status === 400) {
        throw new Error("Invalid email or password format. Please check that your email is valid and your password meets all requirements.");
      }
      if (res.status >= 500) {
        throw new Error("Server unavailable. Please try again in a few moments.");
      }
      throw new Error(errorMsg);
    }

    // Registration successful - do NOT set token (user must log in separately)
    const data = await res.json();
    if (!data) {
      throw new Error("Registration failed");
    }
    // Return success without logging in
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem("token");
  };

  return (
    <AuthContext.Provider
      value={{
        token,
        user,
        isAuthed,
        login,
        register,
        logout,
        refreshMe,
        loading,
        authFetch,
        sessionNotice,
        setSessionNotice,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
