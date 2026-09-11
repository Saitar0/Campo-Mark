import { useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { useLang } from "../../context/LangContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { Badge } from "../../components/ui/badge";
import AgendaTab from "./AgendaTab";
import FieldsTab from "./FieldsTab";
import RevenueTab from "./RevenueTab";
import SubscriptionTab from "./SubscriptionTab";

export default function OwnerDashboard() {
  const { user } = useAuth();
  const { t } = useLang();
  const [tab, setTab] = useState("agenda");

  const sub = user?.subscription || {};
  const trialEnd = sub.trial_ends_at ? new Date(sub.trial_ends_at) : null;
  const trialing = sub.status === "trialing" && trialEnd && trialEnd > new Date();
  const trialDays = trialing ? Math.max(0, Math.ceil((trialEnd - new Date()) / 86400000)) : 0;
  const expired = !trialing && sub.status !== "active";

  return (
    <div className="pt-16 sm:pt-20 max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">{t("nav_dashboard")}</h1>
          <p className="text-slate-500 text-sm mt-1">{user?.name}</p>
        </div>
        <Badge data-testid="owner-subscription-status-badge"
          className={`border-0 px-4 py-2 text-sm ${sub.status === "active" ? "bg-emerald-100 text-emerald-700" : trialing ? "bg-blue-100 text-blue-700" : "bg-rose-100 text-rose-700"}`}>
          {sub.status === "active" ? `${t("active")}` : trialing ? `${t("trialing")} · ${trialDays} ${t("trial_days_left")}` : t(sub.status || "none")}
        </Badge>
      </div>

      {expired && (
        <div data-testid="trial-expired-banner" className="mt-6 bg-rose-50 border border-rose-200 text-rose-700 rounded-2xl p-5 text-sm">
          {t("trial_expired")}
        </div>
      )}

      <Tabs value={tab} onValueChange={setTab} className="mt-8">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger data-testid="tab-agenda" value="agenda">{t("agenda")}</TabsTrigger>
          <TabsTrigger data-testid="tab-fields" value="fields">{t("fields_tab")}</TabsTrigger>
          <TabsTrigger data-testid="tab-revenue" value="revenue">{t("revenue_tab")}</TabsTrigger>
          <TabsTrigger data-testid="tab-subscription" value="subscription">{t("subscription_tab")}</TabsTrigger>
        </TabsList>
        <TabsContent value="agenda" className="mt-6"><AgendaTab /></TabsContent>
        <TabsContent value="fields" className="mt-6"><FieldsTab /></TabsContent>
        <TabsContent value="revenue" className="mt-6"><RevenueTab /></TabsContent>
        <TabsContent value="subscription" className="mt-6"><SubscriptionTab /></TabsContent>
      </Tabs>
    </div>
  );
}
