import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { LangProvider } from "./context/LangContext";
import { Toaster } from "./components/ui/sonner";
import Navbar from "./components/Navbar";
import Landing from "./pages/Landing";
import FieldDetail from "./pages/FieldDetail";
import AuthCallback from "./pages/AuthCallback";
import { AuthPage, ForgotPasswordPage, ResetPasswordPage } from "./pages/AuthPages";
import MyBookings from "./pages/MyBookings";
import OwnerDashboard from "./pages/owner/OwnerDashboard";
import AdminDashboard from "./pages/admin/AdminDashboard";
import { PaymentSuccess, PaymentCancel } from "./pages/PaymentResult";

function Protected({ roles, children }) {
  const { user } = useAuth();
  const location = useLocation();
  if (user === null) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (!user) return <Navigate to="/auth" state={{ from: location.pathname }} replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}

function AppRoutes() {
  const location = useLocation();
  // Google OAuth retorna com #session_id=... — processar antes de qualquer rota protegida
  if (location.hash?.includes("session_id=")) return <AuthCallback />;
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/campo/:id" element={<FieldDetail />} />
      <Route path="/auth" element={<AuthPage />} />
      <Route path="/esqueci-senha" element={<ForgotPasswordPage />} />
      <Route path="/redefinir-senha" element={<ResetPasswordPage />} />
      <Route path="/payment/success" element={<PaymentSuccess />} />
      <Route path="/payment/cancel" element={<PaymentCancel />} />
      <Route path="/minhas-reservas" element={<Protected roles={["customer"]}><MyBookings /></Protected>} />
      <Route path="/painel" element={<Protected roles={["owner"]}><OwnerDashboard /></Protected>} />
      <Route path="/admin" element={<Protected roles={["admin"]}><AdminDashboard /></Protected>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <LangProvider>
      <AuthProvider>
        <BrowserRouter>
          <div className="min-h-screen bg-background">
            <Navbar />
            <AppRoutes />
          </div>
          <Toaster richColors position="top-center" />
        </BrowserRouter>
      </AuthProvider>
    </LangProvider>
  );
}

export default App;
