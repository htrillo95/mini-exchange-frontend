import { Routes, Route } from "react-router-dom";
import GuestHome from "./pages/GuestHome";
import AuthPage from "./pages/AuthPage";
import TradingDashboard from "./TradingDashboard";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<GuestHome />} />
      <Route path="/app" element={<TradingDashboard />} />
      <Route path="/auth" element={<AuthPage />} />
    </Routes>
  );
}
