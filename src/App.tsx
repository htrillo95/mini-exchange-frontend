import { Routes, Route } from "react-router-dom";
import GuestHome from "./pages/GuestHome";
import AuthPage from "./pages/AuthPage";
import TradingDashboard from "./TradingDashboard";
import RequireAuth from "./auth/RequireAuth";
import RedirectIfAuthed from "./auth/RedirectIfAuthed";
import ToastHost from "./components/ToastHost";
import GuestDemo from "./pages/GuestDemo";

export default function App() {
  return (
    <>
      <ToastHost />
      <Routes>
        <Route path="/" element={<GuestHome />} />
        <Route path="/demo" element={<GuestDemo />} />
        <Route
          path="/app"
          element={
            <RequireAuth>
              <TradingDashboard />
            </RequireAuth>
          }
        />
        <Route
          path="/auth"
          element={
            <RedirectIfAuthed>
              <AuthPage />
            </RedirectIfAuthed>
          }
        />
      </Routes>
    </>
  );
}

