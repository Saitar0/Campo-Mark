import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import api from "../lib/api";
import { useLang } from "../context/LangContext";
import { Button } from "../components/ui/button";

export function PaymentSuccess() {
  const { t } = useLang();
  const [params] = useSearchParams();
  const [state, setState] = useState("processing");
  const tries = useRef(0);

  useEffect(() => {
    const sessionId = params.get("session_id");
    if (!sessionId) return setState("failed");
    const poll = async () => {
      try {
        const { data } = await api.get(`/payments/status/${sessionId}`);
        if (data.payment_status === "paid") return setState("paid");
      } catch {}
      tries.current += 1;
      if (tries.current < 20) setTimeout(poll, 2000);
      else setState("failed");
    };
    poll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="pt-16 sm:pt-20 min-h-screen flex items-center justify-center px-4 bg-background">
      <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 p-8 text-center shadow-sm">
        {state === "processing" && (
          <>
            <Loader2 className="w-12 h-12 text-emerald-500 animate-spin mx-auto" />
            <h1 data-testid="payment-processing-title" className="font-display font-bold text-xl text-slate-900 mt-4">{t("payment_processing")}</h1>
          </>
        )}
        {state === "paid" && (
          <>
            <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
            <h1 data-testid="payment-success-title" className="font-display font-bold text-xl text-slate-900 mt-4">{t("payment_success")}</h1>
            <Button data-testid="go-bookings-button" asChild className="mt-6 bg-emerald-500 hover:bg-emerald-600 text-white rounded-full px-6">
              <Link to="/minhas-reservas">{t("go_bookings")}</Link>
            </Button>
          </>
        )}
        {state === "failed" && (
          <>
            <XCircle className="w-12 h-12 text-rose-500 mx-auto" />
            <h1 data-testid="payment-failed-title" className="font-display font-bold text-xl text-slate-900 mt-4">{t("payment_failed")}</h1>
            <Button data-testid="go-home-button" asChild variant="outline" className="mt-6 rounded-full px-6">
              <Link to="/">{t("go_home")}</Link>
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

export function PaymentCancel() {
  const { t } = useLang();
  return (
    <div className="pt-16 sm:pt-20 min-h-screen flex items-center justify-center px-4 bg-background">
      <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 p-8 text-center shadow-sm">
        <XCircle className="w-12 h-12 text-amber-500 mx-auto" />
        <h1 data-testid="payment-cancelled-title" className="font-display font-bold text-xl text-slate-900 mt-4">{t("payment_cancelled")}</h1>
        <p className="text-sm text-slate-500 mt-2">{t("payment_cancelled_text")}</p>
        <Button data-testid="go-home-button" asChild variant="outline" className="mt-6 rounded-full px-6">
          <Link to="/">{t("go_home")}</Link>
        </Button>
      </div>
    </div>
  );
}
