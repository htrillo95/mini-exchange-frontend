import { ReactNode } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { useAuth } from "./AuthContext";

interface RedirectIfAuthedProps {
  children: ReactNode;
}

export default function RedirectIfAuthed({ children }: RedirectIfAuthedProps) {
  const { isAuthed, loading } = useAuth();
  const [searchParams] = useSearchParams();

  if (loading) return null;

  const next = searchParams.get("next") || "/app";

  if (isAuthed) {
    return <Navigate to={next} replace />;
  }

  return <>{children}</>;
}

