import { useEffect, useState } from "react";
import { format } from "date-fns";
import { Ban, Trash2 } from "lucide-react";
import { toast } from "sonner";
import api, { formatApiError } from "../../lib/api";
import { useLang, money } from "../../context/LangContext";
import ReceiptButton from "../../components/ReceiptButton";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../components/ui/dialog";

const SLOT_STYLES = {
  available: "bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100 cursor-pointer",
  booked: "bg-blue-50 text-blue-700 border-blue-300 cursor-pointer",
  blocked: "bg-amber-50 text-amber-700 border-amber-300 cursor-not-allowed",
  past: "bg-slate-50 text-slate-300 border-slate-100 cursor-not-allowed",
};

export default function AgendaTab() {
  const { t } = useLang();
  const [fields, setFields] = useState([]);
  const [fieldId, setFieldId] = useState("");
  const [date, setDate] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [agenda, setAgenda] = useState(null);
  const [blockDialog, setBlockDialog] = useState(null);
  const [bookingDialog, setBookingDialog] = useState(null);
  const [blockForm, setBlockForm] = useState({ start_time: "", end_time: "", reason: "" });

  useEffect(() => {
    api.get("/owner/fields").then((r) => {
      setFields(r.data);
      if (r.data[0]) setFieldId(r.data[0].id);
    }).catch(() => {});
  }, []);

  const load = () => {
    if (!fieldId) return;
    api.get(`/owner/fields/${fieldId}/agenda`, { params: { date } })
      .then((r) => setAgenda(r.data)).catch(() => setAgenda(null));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [fieldId, date]);

  const openBlock = (slot) => {
    setBlockForm({ start_time: slot?.start || "08:00", end_time: slot?.end || "09:00", reason: "" });
    setBlockDialog(true);
  };

  const createBlock = async () => {
    try {
      await api.post(`/owner/fields/${fieldId}/blocks`, { date, ...blockForm });
      toast.success(t("block_created"));
      setBlockDialog(null);
      load();
    } catch (e) {
      toast.error(formatApiError(e));
    }
  };

  const removeBlock = async (id) => {
    try {
      await api.delete(`/owner/blocks/${id}`);
      toast.success(t("block_removed"));
      load();
    } catch (e) {
      toast.error(formatApiError(e));
    }
  };

  const cancelBooking = async (id) => {
    try {
      await api.post(`/owner/bookings/${id}/cancel`);
      toast.success(t("booking_cancelled_by_owner"));
      setBookingDialog(null);
      load();
    } catch (e) {
      toast.error(formatApiError(e));
    }
  };

  const markPaid = async (id) => {
    try {
      await api.post(`/owner/bookings/${id}/mark-paid`);
      toast.success(t("marked_paid"));
      setBookingDialog(null);
      load();
    } catch (e) {
      toast.error(formatApiError(e));
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-full sm:w-64">
          <Label className="text-xs text-slate-500">{t("select_field")}</Label>
          <Select value={fieldId} onValueChange={setFieldId}>
            <SelectTrigger data-testid="agenda-field-select" className="mt-1 bg-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {fields.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs text-slate-500">{t("date")}</Label>
          <Input data-testid="agenda-date-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1 bg-white w-44" />
        </div>
        <Button data-testid="owner-manual-block-button" variant="outline" onClick={() => openBlock(null)}
          className="rounded-full border-amber-300 text-amber-700 hover:bg-amber-50">
          <Ban className="w-4 h-4 mr-2" /> {t("manual_block")}
        </Button>
      </div>

      <div data-testid="owner-agenda-grid" className="mt-6 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {(agenda?.slots || []).map((s) => (
          <button key={s.start} data-testid={`agenda-slot-${s.start}`}
            disabled={s.status === "blocked" || s.status === "past"}
            onClick={() => (s.status === "available" ? openBlock(s) : s.status === "booked" && setBookingDialog(s))}
            className={`rounded-xl border p-3 text-left transition-all active:scale-95 ${SLOT_STYLES[s.status]}`}>
            <div className="font-mono font-semibold text-sm">{s.start} - {s.end}</div>
            <div className="text-xs mt-1 opacity-80 truncate">
              {s.status === "available" ? money(s.price, agenda?.currency) : s.status === "booked" ? s.booking?.customer_name : t(s.status)}
            </div>
          </button>
        ))}
        {agenda && agenda.slots.length === 0 && (
          <p className="col-span-full text-sm text-slate-500 py-6">{t("no_slots")}</p>
        )}
      </div>

      {agenda?.blocks?.length > 0 && (
        <div className="mt-8">
          <h3 className="font-display font-semibold text-slate-900">{t("blocks_today")}</h3>
          <div className="mt-3 space-y-2">
            {agenda.blocks.map((b) => (
              <div key={b.id} data-testid={`block-item-${b.id}`} className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm">
                <span className="font-mono text-amber-800">{b.start_time} - {b.end_time} {b.reason && `· ${b.reason}`}</span>
                <button data-testid={`remove-block-${b.id}`} onClick={() => removeBlock(b.id)} className="text-amber-700 hover:text-rose-600 transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <Dialog open={!!blockDialog} onOpenChange={() => setBlockDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("manual_block")}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{t("time")} ({t("from_price").split(" ")[0] || "de"})</Label>
                <Input data-testid="block-start-input" type="time" value={blockForm.start_time}
                  onChange={(e) => setBlockForm((f) => ({ ...f, start_time: e.target.value }))} className="mt-1" />
              </div>
              <div>
                <Label>até</Label>
                <Input data-testid="block-end-input" type="time" value={blockForm.end_time}
                  onChange={(e) => setBlockForm((f) => ({ ...f, end_time: e.target.value }))} className="mt-1" />
              </div>
            </div>
            <div>
              <Label>{t("block_reason")}</Label>
              <Input data-testid="block-reason-input" value={blockForm.reason}
                onChange={(e) => setBlockForm((f) => ({ ...f, reason: e.target.value }))} className="mt-1" />
            </div>
            <Button data-testid="block-confirm-button" onClick={createBlock}
              className="w-full bg-amber-500 hover:bg-amber-600 text-white rounded-full">
              {t("confirm")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!bookingDialog} onOpenChange={() => setBookingDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{bookingDialog?.booking?.customer_name}</DialogTitle></DialogHeader>
          {bookingDialog?.booking && (
            <div className="space-y-2 text-sm">
              <p className="font-mono">{date} · {bookingDialog.start} - {bookingDialog.end}</p>
              <p className="text-slate-600">{bookingDialog.booking.customer_phone}</p>
              <p className="text-slate-600">{t("payment_method")}: {t(bookingDialog.booking.payment_method === "online" ? "online" : "on_site")} ·{" "}
                <span className={bookingDialog.booking.payment_status === "paid" ? "text-emerald-600 font-semibold" : "text-amber-600 font-semibold"}>
                  {bookingDialog.booking.payment_status === "paid" ? t("paid")
                    : bookingDialog.booking.payment_status === "pending_on_site" ? t("payment_pending_local")
                    : bookingDialog.booking.payment_status}
                </span>
              </p>
              <p className="font-mono font-semibold text-emerald-600">{money(bookingDialog.price, agenda?.currency)}</p>
              <ReceiptButton bookingId={bookingDialog.booking.id} canUpload={bookingDialog.booking.payment_method === "on_site"} onChanged={load} />
              {bookingDialog.booking.payment_method === "on_site" && bookingDialog.booking.payment_status === "pending_on_site" && bookingDialog.booking.status !== "canceled" && (
                <Button data-testid="mark-paid-button" onClick={() => markPaid(bookingDialog.booking.id)}
                  className="w-full mt-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-full">
                  {t("mark_as_paid")}
                </Button>
              )}
              {bookingDialog.booking.status !== "canceled" && (
                <Button data-testid="owner-cancel-booking-button" onClick={() => cancelBooking(bookingDialog.booking.id)}
                  variant="outline" className="w-full mt-4 rounded-full border-rose-200 text-rose-600 hover:bg-rose-50">
                  {t("cancel_booking")}
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
