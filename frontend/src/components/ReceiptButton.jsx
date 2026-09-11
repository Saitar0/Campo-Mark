import { useEffect, useRef, useState } from "react";
import { FileText, Upload } from "lucide-react";
import { toast } from "sonner";
import api, { formatApiError } from "../lib/api";
import { useLang } from "../context/LangContext";
import { Button } from "./ui/button";

export default function ReceiptButton({ bookingId, canUpload = false, onChanged }) {
  const { t } = useLang();
  const [receipt, setReceipt] = useState(undefined);
  const inputRef = useRef(null);

  const load = () =>
    api.get(`/bookings/${bookingId}/receipt`).then((r) => setReceipt(r.data.receipt)).catch(() => setReceipt(null));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [bookingId]);

  const view = async () => {
    if (!receipt) return;
    if (receipt.kind === "stripe") return window.open(receipt.url, "_blank");
    try {
      const r = await api.get(`/bookings/${bookingId}/receipt-file`, { responseType: "blob" });
      window.open(URL.createObjectURL(r.data), "_blank");
    } catch (e) {
      toast.error(formatApiError(e));
    }
  };

  const upload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    try {
      await api.post(`/bookings/${bookingId}/receipt-upload`, fd);
      toast.success(t("receipt_uploaded"));
      load();
      onChanged?.();
    } catch (err) {
      toast.error(formatApiError(err));
    }
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {receipt ? (
        <Button data-testid={`receipt-view-${bookingId}`} size="sm" variant="outline" onClick={view} className="rounded-full">
          <FileText className="w-3.5 h-3.5 mr-1.5" /> {t("view_receipt")}
        </Button>
      ) : receipt === null ? (
        <span data-testid={`receipt-none-${bookingId}`} className="text-xs text-slate-400">{t("no_receipt")}</span>
      ) : null}
      {canUpload && (
        <>
          <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf"
            className="hidden" data-testid={`receipt-upload-input-${bookingId}`} onChange={upload} />
          <Button data-testid={`receipt-upload-${bookingId}`} size="sm" variant="outline"
            onClick={() => inputRef.current?.click()} className="rounded-full">
            <Upload className="w-3.5 h-3.5 mr-1.5" /> {t("upload_receipt")}
          </Button>
        </>
      )}
    </div>
  );
}
