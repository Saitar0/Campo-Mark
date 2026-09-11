import { useEffect, useState } from "react";
import { format } from "date-fns";
import { Banknote, CalendarCheck, CreditCard, Wallet } from "lucide-react";
import api, { brl } from "../../lib/api";
import { useLang } from "../../context/LangContext";
import { Input } from "../../components/ui/input";
import { Badge } from "../../components/ui/badge";

export default function RevenueTab() {
  const { t } = useLang();
  const [month, setMonth] = useState(() => format(new Date(), "yyyy-MM"));
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get("/owner/revenue", { params: { month } }).then((r) => setData(r.data)).catch(() => setData(null));
  }, [month]);

  const cards = [
    { icon: Banknote, label: t("revenue_month"), value: brl(data?.total), testid: "owner-revenue-stat-card" },
    { icon: CalendarCheck, label: t("bookings_count"), value: data?.count ?? "—" },
    { icon: CreditCard, label: t("online"), value: brl(data?.by_method?.online) },
    { icon: Wallet, label: t("on_site"), value: brl(data?.by_method?.on_site) },
  ];

  return (
    <div>
      <div className="flex items-center gap-3">
        <Input data-testid="revenue-month-input" type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="bg-white w-48" />
      </div>

      <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c, i) => (
          <div key={i} data-testid={c.testid} className="bg-white rounded-2xl border border-slate-200 p-6">
            <c.icon className="w-5 h-5 text-emerald-500" />
            <p className="text-xs font-mono uppercase tracking-wider text-slate-400 mt-3">{c.label}</p>
            <p className="font-mono font-bold text-2xl text-slate-900 mt-1">{c.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 bg-white rounded-2xl border border-slate-200 overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs font-mono uppercase tracking-wider text-slate-400">
              <th className="p-4">{t("date")}</th>
              <th className="p-4">{t("time")}</th>
              <th className="p-4">{t("field")}</th>
              <th className="p-4">{t("owner_name") === "Dono" ? "Cliente" : "Customer"}</th>
              <th className="p-4">{t("payment_method")}</th>
              <th className="p-4 text-right">{t("price")}</th>
            </tr>
          </thead>
          <tbody>
            {(data?.bookings || []).map((b) => (
              <tr key={b.id} data-testid={`revenue-booking-${b.id}`} className="border-b border-slate-50">
                <td className="p-4 font-mono">{b.date}</td>
                <td className="p-4 font-mono">{b.start_time} - {b.end_time}</td>
                <td className="p-4">{b.field_name}</td>
                <td className="p-4">{b.customer_name}</td>
                <td className="p-4">
                  <Badge className={`border-0 ${b.payment_method === "online" ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-600"}`}>
                    {t(b.payment_method === "online" ? "online" : "on_site")}
                  </Badge>
                </td>
                <td className="p-4 text-right font-mono font-semibold text-emerald-600">{brl(b.price)}</td>
              </tr>
            ))}
            {data && data.bookings.length === 0 && (
              <tr><td colSpan="6" className="p-8 text-center text-slate-400">{t("no_bookings")}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
