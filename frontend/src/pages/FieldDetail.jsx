import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { addDays, format } from "date-fns";
import { CheckCircle2, MapPin, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import api, { brl, formatApiError } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useLang } from "../context/LangContext";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { RadioGroup, RadioGroupItem } from "../components/ui/radio-group";
import { Label } from "../components/ui/label";

const SLOT_STYLES = {
  available: "bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-600 hover:text-white cursor-pointer",
  booked: "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed",
  blocked: "bg-amber-50 text-amber-700 border-amber-300 cursor-not-allowed",
  past: "bg-slate-50 text-slate-300 border-slate-100 cursor-not-allowed",
};

export default function FieldDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const { t } = useLang();
  const navigate = useNavigate();
  const [field, setField] = useState(null);
  const [date, setDate] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [slots, setSlots] = useState([]);
  const [selected, setSelected] = useState(null);
  const [method, setMethod] = useState("online");
  const [loading, setLoading] = useState(false);

  const days = useMemo(() => Array.from({ length: 14 }, (_, i) => addDays(new Date(), i)), []);
  const weekdayNames = t("days");

  const loadAvailability = (d) => {
    api.get(`/fields/${id}/availability`, { params: { date: d } })
      .then((r) => setSlots(r.data.slots))
      .catch(() => setSlots([]));
  };

  useEffect(() => {
    api.get(`/fields/${id}`).then((r) => setField(r.data)).catch(() => navigate("/"));
  }, [id, navigate]);

  useEffect(() => {
    if (field) {
      setSelected(null);
      loadAvailability(date);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, field]);

  useEffect(() => {
    if (field) {
      if (!field.accept_online && field.accept_on_site) setMethod("on_site");
      else setMethod("online");
    }
  }, [field]);

  const confirm = async () => {
    if (!user) return navigate("/auth");
    setLoading(true);
    try {
      const { data: booking } = await api.post("/bookings", {
        field_id: id, date, start_time: selected.start, payment_method: method,
      });
      if (method === "online") {
        const { data } = await api.post("/payments/booking-checkout", {
          booking_id: booking.id, origin_url: window.location.origin,
        });
        window.location.href = data.checkout_url;
      } else {
        toast.success(t("booking_confirmed"));
        navigate("/minhas-reservas");
      }
    } catch (e) {
      toast.error(formatApiError(e));
      loadAvailability(date);
      setSelected(null);
    } finally {
      setLoading(false);
    }
  };

  if (!field) {
    return (
      <div className="pt-32 flex justify-center">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="pt-16 sm:pt-20 max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-12 pb-32 lg:pb-12">
      <div data-testid="booking-step-indicator" className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-slate-400 mb-6">
        <span className="text-emerald-600 font-semibold">{t("step_field")}</span>
        <span>→</span>
        <span className={selected ? "text-emerald-600 font-semibold" : ""}>{t("step_time")}</span>
        <span>→</span>
        <span>{t("step_pay")}</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12">
        <div className="lg:col-span-8 space-y-8">
          <div>
            <div className="rounded-2xl overflow-hidden h-64 sm:h-80 border border-slate-200">
              <img src={field.photos?.[0]} alt={field.name} className="w-full h-full object-cover" />
            </div>
            <div className="flex items-center gap-3 mt-5 flex-wrap">
              <Badge className="bg-emerald-100 text-emerald-700 border-0">{t(field.field_type)}</Badge>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">{field.name}</h1>
            </div>
            <p className="text-slate-500 flex items-center gap-1.5 mt-2 text-sm">
              <MapPin className="w-4 h-4" /> {field.address} — {field.neighborhood}{field.neighborhood ? ", " : ""}{field.city}
            </p>
            {field.description && <p className="text-slate-600 mt-4 leading-relaxed text-sm sm:text-base">{field.description}</p>}
          </div>

          {field.amenities?.length > 0 && (
            <div>
              <h3 className="font-display font-semibold text-lg text-slate-900 mb-3">{t("what_included")}</h3>
              <div className="flex flex-wrap gap-2">
                {field.amenities.map((a) => (
                  <span key={a} className="inline-flex items-center gap-1.5 text-sm bg-white border border-slate-200 rounded-full px-3.5 py-1.5 text-slate-700">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> {t(`amenity_${a}`)}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 text-sm text-slate-500 bg-slate-50 border border-slate-200 rounded-xl p-4">
            <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
            <span><strong>{t("cancellation_policy")}:</strong> {t("cancel_policy_text", { h: field.cancel_hours, p: field.refund_percent })}</span>
          </div>

          <div>
            <h3 className="font-display font-semibold text-lg text-slate-900 mb-3">{t("choose_date")}</h3>
            <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1">
              {days.map((d) => {
                const iso = format(d, "yyyy-MM-dd");
                const active = iso === date;
                const wd = (d.getDay() + 6) % 7;
                return (
                  <button key={iso} data-testid={`date-pill-${iso}`} onClick={() => setDate(iso)}
                    className={`shrink-0 w-16 py-3 rounded-xl border text-center transition-all active:scale-95 ${
                      active ? "bg-emerald-500 border-emerald-500 text-white shadow-lg shadow-emerald-500/25"
                             : "bg-white border-slate-200 text-slate-600 hover:border-emerald-300"}`}>
                    <div className="text-[10px] font-mono uppercase tracking-wider opacity-80">{weekdayNames[wd]}</div>
                    <div className="font-display font-bold text-lg leading-tight">{format(d, "dd")}</div>
                    <div className="text-[10px] opacity-80">{format(d, "MM")}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <h3 className="font-display font-semibold text-lg text-slate-900 mb-3">{t("choose_time")}</h3>
            {slots.length === 0 ? (
              <p data-testid="no-slots-message" className="text-slate-500 text-sm py-6">{t("no_slots")}</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {slots.map((s) => {
                  const isSelected = selected?.start === s.start;
                  return (
                    <button key={s.start} data-testid={`booking-time-slot-${s.start}`}
                      disabled={s.status !== "available"}
                      onClick={() => setSelected(s)}
                      className={`rounded-xl border p-3 text-left transition-all active:scale-95 ${
                        isSelected ? "bg-emerald-600 border-emerald-600 text-white shadow-lg shadow-emerald-600/25"
                                   : SLOT_STYLES[s.status]}`}>
                      <div className="font-mono font-semibold text-sm">{s.start} - {s.end}</div>
                      <div className={`text-xs mt-1 ${isSelected ? "text-emerald-100" : s.status === "available" ? "text-emerald-600" : "opacity-70"}`}>
                        {s.status === "available" ? brl(s.price) : t(s.status)}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-4">
          <div className="lg:sticky lg:top-24 bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <h3 className="font-display font-bold text-lg text-slate-900">{t("summary")}</h3>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">{t("field")}</dt>
                <dd className="font-medium text-slate-900 text-right">{field.name}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">{t("date")}</dt>
                <dd className="font-mono font-medium text-slate-900">{date}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">{t("time")}</dt>
                <dd className="font-mono font-medium text-slate-900">
                  {selected ? `${selected.start} - ${selected.end}` : "—"}
                </dd>
              </div>
              <div className="flex justify-between gap-4 pt-3 border-t border-slate-100">
                <dt className="text-slate-500">{t("price")}</dt>
                <dd data-testid="summary-price" className="font-mono font-bold text-lg text-emerald-600">
                  {selected ? brl(selected.price) : "—"}
                </dd>
              </div>
            </dl>

            {selected && (
              <div className="mt-6">
                <Label className="text-sm font-semibold text-slate-900">{t("payment_method")}</Label>
                <RadioGroup value={method} onValueChange={setMethod} className="mt-3 space-y-2">
                  {field.accept_online && (
                    <label data-testid="payment-method-card" className={`flex items-center gap-3 rounded-xl border p-3.5 cursor-pointer transition-colors ${method === "online" ? "border-emerald-500 bg-emerald-50" : "border-slate-200"}`}>
                      <RadioGroupItem value="online" />
                      <span className="text-sm text-slate-700">{t("pay_online")}</span>
                    </label>
                  )}
                  {field.accept_on_site && (
                    <label data-testid="payment-method-pix" className={`flex items-center gap-3 rounded-xl border p-3.5 cursor-pointer transition-colors ${method === "on_site" ? "border-emerald-500 bg-emerald-50" : "border-slate-200"}`}>
                      <RadioGroupItem value="on_site" />
                      <span className="text-sm text-slate-700">{t("pay_on_site")}</span>
                    </label>
                  )}
                </RadioGroup>
              </div>
            )}

            <Button data-testid="confirm-booking-submit-button" disabled={!selected || loading} onClick={confirm}
              className="w-full mt-6 bg-emerald-500 hover:bg-emerald-600 text-white rounded-full py-6 text-base font-semibold active:scale-95 transition-transform disabled:opacity-40">
              {loading ? "..." : user ? t("confirm_booking") : t("login_to_book")}
            </Button>
          </div>
        </div>
      </div>

      {selected && (
        <div data-testid="mobile-dock" className="lg:hidden fixed bottom-0 inset-x-0 bg-white border-t border-slate-200 p-4 flex items-center justify-between gap-4 z-40">
          <div>
            <p className="font-mono text-sm font-semibold text-slate-900">{selected.start} - {selected.end}</p>
            <p className="font-mono text-emerald-600 font-bold">{brl(selected.price)}</p>
          </div>
          <Button onClick={confirm} disabled={loading}
            className="bg-emerald-500 hover:bg-emerald-600 text-white rounded-full px-6 active:scale-95 transition-transform">
            {t("confirm_booking")}
          </Button>
        </div>
      )}
    </div>
  );
}
