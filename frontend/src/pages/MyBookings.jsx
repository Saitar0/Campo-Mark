import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarDays, MapPin } from "lucide-react";
import { toast } from "sonner";
import api, { formatApiError } from "../lib/api";
import { useLang, money } from "../context/LangContext";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import ReceiptButton from "../components/ReceiptButton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "../components/ui/alert-dialog";

const STATUS_STYLE = {
  confirmed: "bg-emerald-100 text-emerald-700 border-0",
  pending_payment: "bg-blue-100 text-blue-700 border-0",
  canceled: "bg-rose-100 text-rose-700 border-0",
};

export default function MyBookings() {
  const { t } = useLang();
  const navigate = useNavigate();
  const [bookings, setBookings] = useState(null);

  const load = () => api.get("/bookings/mine").then((r) => setBookings(r.data)).catch(() => setBookings([]));
  useEffect(() => { load(); }, []);

  const cancel = async (id) => {
    try {
      await api.post(`/bookings/${id}/cancel`);
      toast.success(t("booking_cancelled"));
      load();
    } catch (e) {
      toast.error(formatApiError(e));
    }
  };

  const payNow = async (id) => {
    try {
      const { data } = await api.post("/payments/booking-checkout", {
        booking_id: id, origin_url: window.location.origin,
      });
      window.location.href = data.checkout_url;
    } catch (e) {
      toast.error(formatApiError(e));
    }
  };

  return (
    <div className="pt-16 sm:pt-20 max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
      <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">{t("my_bookings")}</h1>

      {bookings === null ? (
        <div className="mt-8 space-y-4">{[1, 2].map((i) => <div key={i} className="h-28 rounded-2xl bg-slate-100 animate-pulse" />)}</div>
      ) : bookings.length === 0 ? (
        <div className="mt-12 text-center">
          <p data-testid="no-bookings-message" className="text-slate-500">{t("no_bookings")}</p>
          <Button onClick={() => navigate("/")} className="mt-4 bg-emerald-500 hover:bg-emerald-600 text-white rounded-full px-6">
            {t("nav_explore")}
          </Button>
        </div>
      ) : (
        <div className="mt-8 space-y-4">
          {bookings.map((b) => (
            <div key={b.id} data-testid={`booking-card-${b.id}`}
              className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
              <div className="space-y-1.5">
                <div className="flex items-center gap-3 flex-wrap">
                  <h3 className="font-display font-bold text-lg text-slate-900">{b.field_name}</h3>
                  <Badge data-testid={`booking-status-${b.id}`} className={STATUS_STYLE[b.status]}>{t(`status_${b.status}`)}</Badge>
                  {b.status === "confirmed" && b.payment_method === "on_site" && (
                    <Badge data-testid={`booking-payment-${b.id}`}
                      className={`border-0 ${b.payment_status === "paid" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                      {b.payment_status === "paid" ? t("paid") : t("payment_pending_local")}
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-slate-500 flex items-center gap-1.5">
                  <CalendarDays className="w-4 h-4" />
                  <span className="font-mono">{b.date} · {b.start_time} - {b.end_time}</span>
                  <span className="font-mono font-semibold text-emerald-600 ml-2">{money(b.price, b.currency)}</span>
                </p>
                <p className="text-sm text-slate-500 flex items-center gap-1.5">
                  <MapPin className="w-4 h-4" /> {b.field_address}{b.field_city ? ` — ${b.field_city}` : ""}
                </p>
                {b.status === "confirmed" && (
                  <ReceiptButton bookingId={b.id} canUpload={b.payment_method === "on_site"} />
                )}
              </div>
              <div className="flex gap-2 shrink-0">
                {b.status === "pending_payment" && (
                  <Button data-testid={`pay-now-button-${b.id}`} onClick={() => payNow(b.id)}
                    className="bg-emerald-500 hover:bg-emerald-600 text-white rounded-full active:scale-95 transition-transform">
                    {t("pay_now")}
                  </Button>
                )}
                {b.status !== "canceled" && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button data-testid={`cancel-booking-button-${b.id}`} variant="outline"
                        className="rounded-full border-rose-200 text-rose-600 hover:bg-rose-50">
                        {t("cancel_booking")}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>{t("confirm_cancel_title")}</AlertDialogTitle>
                        <AlertDialogDescription>
                          {b.field_name} — {b.date} {b.start_time}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel data-testid="cancel-dialog-no">{t("back")}</AlertDialogCancel>
                        <AlertDialogAction data-testid="cancel-dialog-confirm" onClick={() => cancel(b.id)}
                          className="bg-rose-600 hover:bg-rose-700">
                          {t("confirm")}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
