import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function AuthCallback() {
  const { socialLogin } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const processed = useRef(false);

  useEffect(() => {
    if (processed.current) return;
    processed.current = true;
    const sessionId = new URLSearchParams(location.hash.replace("#", "")).get("session_id");
    const role = new URLSearchParams(location.search).get("role") || "customer";
    socialLogin(sessionId, role)
      .then((user) => {
        navigate(user.role === "owner" ? "/painel" : user.role === "admin" ? "/admin" : "/", { replace: true });
      })
      .catch(() => navigate("/auth", { replace: true }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
