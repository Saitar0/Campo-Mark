import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Crown } from "lucide-react";
import api, { brl, formatApiError } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { useLang } from "../../context/LangContext";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";

export default function SubscriptionTab() {
  const { user } = useAuth();
  const { t } = useLang();
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get("/payments/plan").then((r) => setPlan(r.data)).catch(() => {});
  }, []);

  const sub = user?.subscription || {};
  const trialEnd = sub.trial_ends_at ? new Date(sub.trial_ends_at) : null;
  const trialing = sub.status === "trialing" && trialEnd && trialEnd > new Date();
  const trialDays = trialing ? Math.max(0, Math.ceil((trialEnd - new Date()) / 86400000)) : 0;
  const statusKey = sub.status === "trialing" && !trialing ? "none" : sub.status || "none";

  const subscribe = async () => {
    setLoading(true);
    try {
      const { data } = await api.post("/payments/subscribe", { origin_url: window.location.origin });
      window.location.href = data.checkout_url;
    } catch (e) {
      toast.error(formatApiError(e));
      setLoading(false);
    }
  };

  return (
    <div className="max-w-xl">
      <div className="bg-[#0B0F17] text-white rounded-2xl p-8 relative overflow-hidden">
        <div className="absolute -top-12 -right-12 w-48 h-48 rounded-full bg-emerald-500/10" />
        <Crown className="w-8 h-8 text-emerald-400" />
        <h2 className="font-display font-bold text-2xl mt-4">CampoMark Pro</h2>
        <p className="text-slate-300 text-sm mt-2">{t("plan_includes")}</p>
        <p className="mt-4">
          <span className="font-mono font-bold text-4xl">{plan?.price != null ? brl(plan.price) : "—"}</span>
          <span className="text-slate-400 text-sm">/mês</span>
        </p>

        <div className="mt-6 flex items-center gap-3 flex-wrap">
          <Badge data-testid="subscription-status-detail"
            className={`border-0 ${sub.status === "active" ? "bg-emerald-500/20 text-emerald-300" : trialing ? "bg-blue-500/20 text-blue-300" : "bg-rose-500/20 text-rose-300"}`}>
            {t("subscription_status")}: {t(statusKey)}
          </Badge>
          {trialing && <span className="text-sm text-blue-300">{trialDays} {t("trial_days_left")}</span>}
          {sub.status === "active" && sub.current_period_end && (
            <span className="text-sm text-slate-400">{t("renews_at")} {sub.current_period_end.slice(0, 10)}</span>
          )}
        </div>

        {sub.status !== "active" && (
          <Button data-testid="subscribe-button" onClick={subscribe} disabled={loading}
            className="mt-8 bg-emerald-500 hover:bg-emerald-600 text-white rounded-full px-8 py-6 text-base font-semibold active:scale-95 transition-transform">
            {loading ? "..." : t("subscribe_now")}
          </Button>
        )}
      </div>
    </div>
  );
}
