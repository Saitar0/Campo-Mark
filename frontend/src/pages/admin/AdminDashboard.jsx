import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Building2, CalendarCheck, CircleDollarSign, Users } from "lucide-react";
import api, { brl, formatApiError } from "../../lib/api";
import { useLang } from "../../context/LangContext";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import OwnerDetail from "./OwnerDetail";

const SUB_STYLE = {
  active: "bg-emerald-100 text-emerald-700 border-0",
  trialing: "bg-blue-100 text-blue-700 border-0",
  past_due: "bg-amber-100 text-amber-700 border-0",
  canceled: "bg-rose-100 text-rose-700 border-0",
  none: "bg-slate-100 text-slate-500 border-0",
};

const ACCOUNT_STYLE = {
  active: "bg-emerald-100 text-emerald-700 border-0",
  suspended: "bg-amber-100 text-amber-700 border-0",
  banned: "bg-rose-100 text-rose-700 border-0",
  deleted: "bg-slate-200 text-slate-500 border-0",
};

export default function AdminDashboard() {
  const { t } = useLang();
  const [metrics, setMetrics] = useState(null);
  const [owners, setOwners] = useState([]);
  const [logs, setLogs] = useState([]);
  const [detailId, setDetailId] = useState(null);

  const load = () => {
    api.get("/admin/metrics").then((r) => setMetrics(r.data)).catch(() => {});
    api.get("/admin/owners").then((r) => setOwners(r.data)).catch(() => {});
    api.get("/admin/audit-logs").then((r) => setLogs(r.data)).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  const toggle = async (id, activate) => {
    try {
      await api.post(`/admin/owners/${id}/account`, { action: activate ? "activate" : "suspend" });
      toast.success(t(activate ? "account_activated" : "account_suspended"));
      load();
    } catch (e) {
      toast.error(formatApiError(e));
    }
  };

  const cards = [
    { icon: Users, label: t("owners"), value: metrics?.owners_total },
    { icon: CircleDollarSign, label: t("mrr"), value: metrics ? brl(metrics.mrr) : "—", testid: "admin-mrr-stat-card" },
    { icon: CalendarCheck, label: t("bookings_month"), value: metrics?.bookings_month },
    { icon: Building2, label: t("fields_total"), value: metrics?.fields_total },
    { icon: CircleDollarSign, label: t("gmv_month"), value: metrics ? brl(metrics.gmv_month) : "—" },
    { icon: Users, label: t("active_subs"), value: metrics?.subscriptions_active },
    { icon: Users, label: t("trialing_subs"), value: metrics?.subscriptions_trialing },
    { icon: Users, label: t("past_due_subs"), value: metrics?.subscriptions_past_due },
  ];

  return (
    <div className="pt-16 sm:pt-20 max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
      <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">{t("admin_metrics")}</h1>

      <div className="mt-6 grid grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c, i) => (
          <div key={i} data-testid={c.testid} className="bg-white rounded-2xl border border-slate-200 p-6">
            <c.icon className="w-5 h-5 text-emerald-500" />
            <p className="text-xs font-mono uppercase tracking-wider text-slate-400 mt-3">{c.label}</p>
            <p className="font-mono font-bold text-2xl text-slate-900 mt-1">{c.value ?? "—"}</p>
          </div>
        ))}
      </div>

      <h2 className="font-display font-semibold text-xl text-slate-900 mt-10">{t("owners")}</h2>
      <div className="mt-4 bg-white rounded-2xl border border-slate-200 overflow-x-auto">
        <table data-testid="admin-owners-table" className="w-full text-sm min-w-[820px]">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs font-mono uppercase tracking-wider text-slate-400">
              <th className="p-4">{t("owner_name")}</th>
              <th className="p-4">{t("email")}</th>
              <th className="p-4">{t("subscription")}</th>
              <th className="p-4">Status</th>
              <th className="p-4">{t("fields_total")}</th>
              <th className="p-4">{t("bookings_count")}</th>
              <th className="p-4 text-right">{t("actions")}</th>
            </tr>
          </thead>
          <tbody>
            {owners.map((o) => (
              <tr key={o.id} data-testid={`admin-owner-row-${o.id}`} className="border-b border-slate-50">
                <td className="p-4">
                  <button data-testid={`admin-owner-detail-${o.id}`} onClick={() => setDetailId(o.id)}
                    className="font-medium text-slate-900 hover:text-emerald-600 hover:underline transition-colors">
                    {o.name}
                  </button>
                </td>
                <td className="p-4 text-slate-600">{o.email}</td>
                <td className="p-4">
                  <Badge className={SUB_STYLE[o.subscription_status] || SUB_STYLE.none}>
                    {t(o.subscription_status)}
                    {o.subscription_status === "trialing" && o.trial_days_left > 0 ? ` (${o.trial_days_left}d)` : ""}
                  </Badge>
                </td>
                <td className="p-4">
                  <Badge data-testid={`admin-owner-status-${o.id}`} className={ACCOUNT_STYLE[o.account_status || (o.is_active ? "active" : "suspended")]}>
                    {t(o.account_status || (o.is_active ? "active" : "suspended"))}
                  </Badge>
                </td>
                <td className="p-4 font-mono">{o.fields_count}</td>
                <td className="p-4 font-mono">{o.bookings_count}</td>
                <td className="p-4 text-right">
                  <Button data-testid={`admin-toggle-owner-status-${o.id}`} size="sm" variant="outline"
                    onClick={() => toggle(o.id, !o.is_active)}
                    className={`rounded-full ${o.is_active ? "border-rose-200 text-rose-600 hover:bg-rose-50" : "border-emerald-300 text-emerald-700 hover:bg-emerald-50"}`}>
                    {o.is_active ? t("deactivate") : t("activate")}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="font-display font-semibold text-xl text-slate-900 mt-10">{t("audit_log")}</h2>
      <div className="mt-4 bg-white rounded-2xl border border-slate-200 overflow-x-auto">
        <table data-testid="audit-log-table" className="w-full text-sm min-w-[720px]">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs font-mono uppercase tracking-wider text-slate-400">
              <th className="p-4">{t("when")}</th>
              <th className="p-4">{t("actor")}</th>
              <th className="p-4">{t("action")}</th>
              <th className="p-4">{t("target")}</th>
              <th className="p-4">{t("description")}</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id} data-testid={`audit-log-row-${l.id}`} className="border-b border-slate-50">
                <td className="p-4 font-mono text-xs text-slate-500">{l.created_at?.replace("T", " ").slice(0, 19)}</td>
                <td className="p-4 text-slate-600">{l.actor_email}</td>
                <td className="p-4"><Badge className="bg-slate-100 text-slate-700 border-0 font-mono text-xs">{l.action}</Badge></td>
                <td className="p-4 font-mono text-xs text-slate-500">{l.target_type}:{l.target_id?.slice(0, 8)}</td>
                <td className="p-4 text-slate-600 text-xs">{l.details}</td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr><td colSpan="5" className="p-8 text-center text-slate-400">—</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <OwnerDetail ownerId={detailId} open={!!detailId} onOpenChange={() => setDetailId(null)} onChanged={load} />
    </div>
  );
}
