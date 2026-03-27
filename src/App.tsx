import { Routes, Route } from "react-router-dom";
import GuestHome from "./pages/GuestHome";
import AuthPage from "./pages/AuthPage";
import TradingDashboard from "./TradingDashboard";
import RequireAuth from "./auth/RequireAuth";
import RedirectIfAuthed from "./auth/RedirectIfAuthed";
import ToastHost from "./components/ToastHost";
import GuestDemo from "./pages/GuestDemo";
import NewsPage from "./pages/NewsPage";
import AboutPage from "./pages/AboutPage";

export default function App() {
  return (
    <div className="app-root">
      <ToastHost />
      <Routes>
        <Route path="/" element={<GuestHome />} />
        <Route path="/demo" element={<GuestDemo />} />
        <Route path="/news" element={<NewsPage />} />
        <Route path="/about" element={<AboutPage />} />
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
    </div>
  );
}

