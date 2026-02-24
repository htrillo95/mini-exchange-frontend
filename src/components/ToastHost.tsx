import Toast from "./Toast";
import { useAuth } from "../auth/AuthContext";

export default function ToastHost() {
  const { sessionNotice, setSessionNotice } = useAuth();

  if (!sessionNotice) return null;

  return (
    <Toast
      message={sessionNotice}
      type="info"
      duration={4000}
      onClose={() => setSessionNotice(null)}
    />
  );
}

