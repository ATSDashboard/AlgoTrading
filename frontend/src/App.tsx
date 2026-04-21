import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "@/stores/auth";
import Login from "@/pages/Login";
import ConnectBroker from "@/pages/ConnectBroker";
import Dashboard from "@/pages/Dashboard";
import NewStrategy from "@/pages/NewStrategy";
import StrategyMonitor from "@/pages/StrategyMonitor";
import Reports from "@/pages/Reports";
import Settings from "@/pages/Settings";
import Admin from "@/pages/Admin";
import AuditBrowser from "@/pages/AuditBrowser";
import Templates from "@/pages/Templates";
import Layout from "@/components/Layout";
import Toaster from "@/components/Toast";
import CommandPalette from "@/components/CommandPalette";

// Phase-2 pages (MLLab, Analytics, TradeAdvanced, TradeIndex) live in the
// sibling "Theta Gainers — Future Modules" folder. Drop them back in when Phase 2 starts.

function RequireAuth({ children }: { children: JSX.Element }) {
  const token = useAuth((s) => s.token);
  if (!token) return <Navigate to="/login" replace />;
  return children;
}

function RequireBroker({ children }: { children: JSX.Element }) {
  const session = useAuth((s) => s.brokerSession);
  if (!session) return <Navigate to="/connect-broker" replace />;
  return children;
}

export default function App() {
  return (
    <>
    <Toaster />
    <CommandPalette />
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/connect-broker" element={<RequireAuth><ConnectBroker /></RequireAuth>} />
      <Route element={<RequireAuth><Layout /></RequireAuth>}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/trade" element={<RequireBroker><NewStrategy /></RequireBroker>} />
        <Route path="/strategy/new" element={<RequireBroker><NewStrategy /></RequireBroker>} />
        <Route path="/strategy/:id" element={<StrategyMonitor />} />
        <Route path="/reports/*" element={<Reports />} />
        <Route path="/templates" element={<Templates />} />
        <Route path="/settings/*" element={<Settings />} />
        <Route path="/admin/audit" element={<AuditBrowser />} />
        <Route path="/admin/*" element={<Admin />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </>
  );
}
