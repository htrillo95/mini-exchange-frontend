import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";

interface RequireAuthProps {
  children: ReactNode;
}

export default function RequireAuth({ children }: RequireAuthProps) {
  const { isAuthed, loading } = useAuth();
  const location = useLocation();

  if (loading) return null;

  if (!isAuthed) {
    const next = encodeURIComponent(location.pathname + location.search || "/app");
    return <Navigate to={`/auth?next=${next}`} replace />;
  }

  return <>{children}</>;
}

