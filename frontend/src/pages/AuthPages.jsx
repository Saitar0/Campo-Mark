import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "../context/AuthContext";
import { useLang } from "../context/LangContext";
import { formatApiError } from "../lib/api";
import api from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { RadioGroup, RadioGroupItem } from "../components/ui/radio-group";

const DEMO = {
  customer: "jogador@campomark.com",
  owner: "dono@campomark.com",
  admin: "joaovitor.gallina09@gmail.com",
};

export function GoogleButton({ role }) {
  const { t } = useLang();
  const googleLogin = () => {
    // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    const redirectUrl = window.location.origin + "/auth/callback" + (role === "owner" ? "?role=owner" : "");
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };
  return (
    <button type="button" data-testid="google-login-button" onClick={googleLogin}
      className="w-full flex items-center justify-center gap-3 rounded-full border border-slate-300 bg-white py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 active:scale-95 transition-all">
      <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 8 3l5.7-5.7C34.3 6.1 29.4 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 18.9 12 24 12c3.1 0 5.8 1.2 8 3l5.7-5.7C34.3 6.1 29.4 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C36.9 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z"/></svg>
      {t("continue_with_google")}
    </button>
  );
}

function Divider() {
  const { t } = useLang();
  return (
    <div className="flex items-center gap-3 my-4">
      <div className="flex-1 h-px bg-slate-200" />
      <span className="text-xs text-slate-400 uppercase">{t("or_divider")}</span>
      <div className="flex-1 h-px bg-slate-200" />
    </div>
  );
}

export function AuthPage() {
  const { login, register } = useAuth();
  const { t } = useLang();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [tab, setTab] = useState("login");
  const [form, setForm] = useState({ name: "", email: "", password: "", phone: "", role: params.get("role") === "owner" ? "owner" : "customer" });
  const [loading, setLoading] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const go = (user) => {
    if (user.role === "owner") navigate("/painel");
    else if (user.role === "admin") navigate("/admin");
    else navigate("/");
  };

  const submitLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      go(await login(form.email, form.password));
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setLoading(false);
    }
  };

  const submitRegister = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      go(await register(form));
      toast.success(t("booking_confirmed").replace("Reserva", "Conta"));
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setLoading(false);
    }
  };

  const demoLogin = async (role) => {
    setLoading(true);
    try {
      const password = role === "admin" ? "CampoMark@2026" : "demo12345";
      go(await login(DEMO[role], password));
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="pt-16 sm:pt-20 min-h-screen bg-[#0B0F17] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl p-8 shadow-2xl">
          <h1 className="font-display font-extrabold text-2xl text-slate-900 text-center">
            Campo<span className="text-emerald-500">Mark</span>
          </h1>
          <Tabs value={tab} onValueChange={setTab} className="mt-6">
            <TabsList className="w-full">
              <TabsTrigger data-testid="tab-login" value="login" className="flex-1">{t("login")}</TabsTrigger>
              <TabsTrigger data-testid="tab-register" value="register" className="flex-1">{t("register")}</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <form onSubmit={submitLogin} className="space-y-4 mt-4">
                <div>
                  <Label>{t("email")}</Label>
                  <Input data-testid="login-email-input" type="email" required value={form.email} onChange={set("email")} className="mt-1.5" />
                </div>
                <div>
                  <Label>{t("password")}</Label>
                  <Input data-testid="login-password-input" type="password" required value={form.password} onChange={set("password")} className="mt-1.5" />
                </div>
                <Button data-testid="auth-submit-button" disabled={loading}
                  className="w-full bg-emerald-500 hover:bg-emerald-600 text-white rounded-full py-5 active:scale-95 transition-transform">
                  {t("login")}
                </Button>
                <Link to="/esqueci-senha" data-testid="forgot-password-link" className="block text-center text-sm text-emerald-600 hover:underline">
                  {t("forgot_password")}
                </Link>
              </form>
              <Divider />
              <GoogleButton role="customer" />
            </TabsContent>

            <TabsContent value="register">
              <form onSubmit={submitRegister} className="space-y-4 mt-4">
                <div>
                  <Label>{t("i_am")}</Label>
                  <RadioGroup value={form.role} onValueChange={(v) => setForm((f) => ({ ...f, role: v }))} className="mt-2 space-y-2">
                    <label data-testid="role-customer-option" className={`flex items-center gap-3 rounded-xl border p-3 cursor-pointer ${form.role === "customer" ? "border-emerald-500 bg-emerald-50" : "border-slate-200"}`}>
                      <RadioGroupItem value="customer" />
                      <span className="text-sm text-slate-700">{t("customer_role")}</span>
                    </label>
                    <label data-testid="role-owner-option" className={`flex items-center gap-3 rounded-xl border p-3 cursor-pointer ${form.role === "owner" ? "border-emerald-500 bg-emerald-50" : "border-slate-200"}`}>
                      <RadioGroupItem value="owner" />
                      <span className="text-sm text-slate-700">{t("owner_role")}</span>
                    </label>
                  </RadioGroup>
                </div>
                <div>
                  <Label>{t("name")}</Label>
                  <Input data-testid="register-name-input" required value={form.name} onChange={set("name")} className="mt-1.5" />
                </div>
                <div>
                  <Label>{t("phone")}</Label>
                  <Input data-testid="register-phone-input" value={form.phone} onChange={set("phone")} placeholder="+5511999999999" className="mt-1.5" />
                </div>
                <div>
                  <Label>{t("email")}</Label>
                  <Input data-testid="register-email-input" type="email" required value={form.email} onChange={set("email")} className="mt-1.5" />
                </div>
                <div>
                  <Label>{t("password")}</Label>
                  <Input data-testid="register-password-input" type="password" required minLength={6} value={form.password} onChange={set("password")} className="mt-1.5" />
                </div>
                <Button data-testid="register-submit-button" disabled={loading}
                  className="w-full bg-emerald-500 hover:bg-emerald-600 text-white rounded-full py-5 active:scale-95 transition-transform">
                  {t("register")}
                </Button>
                {form.role === "owner" && (
                  <p className="text-xs text-center text-slate-500">7 {t("trial_days_left")} · {t("plan_includes")}</p>
                )}
              </form>
              <Divider />
              <GoogleButton role={form.role} />
            </TabsContent>
          </Tabs>
        </div>

        <div className="mt-4 bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-wrap gap-2 justify-center">
          <Button data-testid="demo-customer-login-button" variant="outline" size="sm" disabled={loading} onClick={() => demoLogin("customer")}
            className="rounded-full border-white/20 text-white hover:bg-white/10 bg-transparent text-xs">
            {t("demo_customer")}
          </Button>
          <Button data-testid="demo-owner-login-button" variant="outline" size="sm" disabled={loading} onClick={() => demoLogin("owner")}
            className="rounded-full border-white/20 text-white hover:bg-white/10 bg-transparent text-xs">
            {t("demo_owner")}
          </Button>
          <Button data-testid="demo-admin-login-button" variant="outline" size="sm" disabled={loading} onClick={() => demoLogin("admin")}
            className="rounded-full border-white/20 text-white hover:bg-white/10 bg-transparent text-xs">
            {t("demo_admin")}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function ForgotPasswordPage() {
  const { t } = useLang();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    try {
      await api.post("/auth/forgot-password", { email });
    } catch {}
    setSent(true);
  };

  return (
    <div className="pt-16 sm:pt-20 min-h-screen bg-[#0B0F17] flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white rounded-2xl p-8 shadow-2xl">
        <h1 className="font-display font-bold text-xl text-slate-900">{t("forgot_password")}</h1>
        {sent ? (
          <p data-testid="reset-sent-message" className="mt-4 text-sm text-slate-600">{t("reset_sent")}</p>
        ) : (
          <form onSubmit={submit} className="mt-4 space-y-4">
            <Input data-testid="forgot-email-input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t("email")} />
            <Button data-testid="forgot-submit-button" className="w-full bg-emerald-500 hover:bg-emerald-600 text-white rounded-full py-5">
              {t("send_reset")}
            </Button>
          </form>
        )}
        <Link to="/auth" data-testid="back-to-login-link" className="block mt-4 text-center text-sm text-emerald-600 hover:underline">
          {t("back_to_login")}
        </Link>
      </div>
    </div>
  );
}

export function ResetPasswordPage() {
  const { t } = useLang();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [password, setPassword] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    try {
      await api.post("/auth/reset-password", { token: params.get("token") || "", password });
      toast.success(t("reset_password"));
      navigate("/auth");
    } catch (err) {
      toast.error(formatApiError(err));
    }
  };

  return (
    <div className="pt-16 sm:pt-20 min-h-screen bg-[#0B0F17] flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white rounded-2xl p-8 shadow-2xl">
        <h1 className="font-display font-bold text-xl text-slate-900">{t("reset_password")}</h1>
        <form onSubmit={submit} className="mt-4 space-y-4">
          <Input data-testid="reset-password-input" type="password" required minLength={6} value={password}
            onChange={(e) => setPassword(e.target.value)} placeholder={t("new_password")} />
          <Button data-testid="reset-submit-button" className="w-full bg-emerald-500 hover:bg-emerald-600 text-white rounded-full py-5">
            {t("reset_password")}
          </Button>
        </form>
        <Link to="/auth" className="block mt-4 text-center text-sm text-emerald-600 hover:underline">
          {t("back_to_login")}
        </Link>
      </div>
    </div>
  );
}
