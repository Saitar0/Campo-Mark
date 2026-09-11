import { useEffect, useState } from "react";
import { Eye, EyeOff, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import api, { formatApiError } from "../../lib/api";
import { useLang, money } from "../../context/LangContext";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import { Badge } from "../../components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "../../components/ui/alert-dialog";
import FieldFormDialog from "../../components/FieldFormDialog";

const ACCOUNT_STYLE = {
  active: "bg-emerald-100 text-emerald-700 border-0",
  suspended: "bg-amber-100 text-amber-700 border-0",
  banned: "bg-rose-100 text-rose-700 border-0",
  deleted: "bg-slate-200 text-slate-500 border-0",
};

function ConfirmAction({ testid, label, className, description, onConfirm, t }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button data-testid={testid} size="sm" variant="outline" className={`rounded-full ${className}`}>{label}</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{label}</AlertDialogTitle>
          <AlertDialogDescription>{description || t("confirm_destructive")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel data-testid={`${testid}-no`}>{t("cancel")}</AlertDialogCancel>
          <AlertDialogAction data-testid={`${testid}-confirm`} onClick={onConfirm} className="bg-rose-600 hover:bg-rose-700">
            {t("confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default function OwnerDetail({ ownerId, open, onOpenChange, onChanged }) {
  const { t } = useLang();
  const [data, setData] = useState(null);
  const [profile, setProfile] = useState({ name: "", phone: "" });
  const [warnMsg, setWarnMsg] = useState("");
  const [editField, setEditField] = useState(null);
  const [fieldDialog, setFieldDialog] = useState(false);

  const load = () => {
    if (!ownerId) return;
    api.get(`/admin/owners/${ownerId}/detail`).then((r) => {
      setData(r.data);
      setProfile({ name: r.data.owner.name || "", phone: r.data.owner.phone || "" });
    }).catch((e) => toast.error(formatApiError(e)));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (open) load(); }, [open, ownerId]);

  const changed = () => { load(); onChanged?.(); };

  const saveProfile = async () => {
    try {
      await api.put(`/admin/owners/${ownerId}`, profile);
      toast.success(t("profile_updated"));
      changed();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const accountAction = async (action) => {
    try {
      await api.post(`/admin/owners/${ownerId}/account`, { action });
      toast.success(t(`account_${action}d`) || t("account_activated"));
      changed();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const sendWarning = async () => {
    try {
      await api.post(`/admin/owners/${ownerId}/warn`, { message: warnMsg });
      toast.success(t("warning_sent"));
      setWarnMsg("");
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const saveField = async (payload, editingId) => {
    try {
      await api.put(`/admin/fields/${editingId}`, payload);
      toast.success(t("field_saved"));
      setFieldDialog(false);
      changed();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const toggleVisibility = async (f) => {
    try {
      await api.post(`/admin/fields/${f.id}/visibility`, { hidden: !f.hidden });
      toast.success(f.hidden ? t("field_visible") : t("field_hidden"));
      changed();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const deleteField = async (f) => {
    try {
      await api.delete(`/admin/fields/${f.id}`);
      toast.success(t("field_deleted"));
      changed();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const o = data?.owner;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto" data-testid="owner-detail-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3 flex-wrap">
            {t("view_as_owner")}: {o?.name}
            {o && <Badge className={ACCOUNT_STYLE[o.account_status]}>{t(o.account_status)}</Badge>}
            {o && <Badge className="bg-blue-100 text-blue-700 border-0">{t(o.subscription_status)}</Badge>}
          </DialogTitle>
        </DialogHeader>

        {!data ? (
          <div className="py-12 flex justify-center">
            <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="space-y-8 pb-2">
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-slate-50 rounded-xl p-4 text-center">
                <p className="font-mono font-bold text-xl">{data.fields.length}</p>
                <p className="text-xs text-slate-500">{t("fields_total")}</p>
              </div>
              <div className="bg-slate-50 rounded-xl p-4 text-center">
                <p className="font-mono font-bold text-xl">{data.revenue_month.count}</p>
                <p className="text-xs text-slate-500">{t("bookings_month")}</p>
              </div>
              <div className="bg-slate-50 rounded-xl p-4 text-center">
                <p className="font-mono font-bold text-xl text-emerald-600">{money(data.revenue_month.total)}</p>
                <p className="text-xs text-slate-500">{t("revenue_month")}</p>
              </div>
            </div>

            <div>
              <h3 className="font-display font-semibold text-slate-900 mb-3">{t("edit_profile")}</h3>
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <Label className="text-xs">{t("name")}</Label>
                  <Input data-testid="admin-owner-name-input" value={profile.name}
                    onChange={(e) => setProfile((p) => ({ ...p, name: e.target.value }))} className="mt-1 w-56" />
                </div>
                <div>
                  <Label className="text-xs">{t("phone")}</Label>
                  <Input data-testid="admin-owner-phone-input" value={profile.phone}
                    onChange={(e) => setProfile((p) => ({ ...p, phone: e.target.value }))} className="mt-1 w-48" />
                </div>
                <Button data-testid="admin-owner-save-profile" size="sm" onClick={saveProfile}
                  className="bg-emerald-500 hover:bg-emerald-600 text-white rounded-full">{t("save")}</Button>
              </div>
            </div>

            <div>
              <h3 className="font-display font-semibold text-slate-900 mb-3">{t("fields_tab")}</h3>
              <div className="space-y-2">
                {data.fields.map((f) => (
                  <div key={f.id} data-testid={`admin-field-row-${f.id}`}
                    className="flex items-center justify-between gap-3 border border-slate-200 rounded-xl p-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-sm text-slate-900 truncate">
                        {f.name}
                        {f.hidden && <Badge className="ml-2 bg-amber-100 text-amber-700 border-0">{t("hidden_field")}</Badge>}
                      </p>
                      <p className="text-xs text-slate-500">{f.city} · {f.country || "BR"} · <span className="font-mono">{(f.currency || "brl").toUpperCase()}</span></p>
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      <Button data-testid={`admin-edit-field-${f.id}`} size="sm" variant="outline"
                        onClick={() => { setEditField(f); setFieldDialog(true); }} className="rounded-full">
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button data-testid={`admin-field-hide-${f.id}`} size="sm" variant="outline"
                        onClick={() => toggleVisibility(f)} className="rounded-full">
                        {f.hidden ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                      </Button>
                      <ConfirmAction t={t} testid={`admin-delete-field-${f.id}`} label={<Trash2 className="w-3.5 h-3.5" />}
                        className="border-rose-200 text-rose-600 hover:bg-rose-50"
                        description={`${t("delete")}: ${f.name}`} onConfirm={() => deleteField(f)} />
                    </div>
                  </div>
                ))}
                {data.fields.length === 0 && <p className="text-sm text-slate-400">{t("no_fields")}</p>}
              </div>
            </div>

            <div>
              <h3 className="font-display font-semibold text-slate-900 mb-3">{t("recent_bookings")}</h3>
              <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-56 overflow-y-auto">
                {data.bookings.map((b) => (
                  <div key={b.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                    <span className="font-mono text-slate-600">{b.date} {b.start_time}</span>
                    <span className="truncate mx-3">{b.field_name} · {b.customer_name}</span>
                    <span className="font-mono font-semibold text-emerald-600">{money(b.price, b.currency)}</span>
                  </div>
                ))}
                {data.bookings.length === 0 && <p className="p-4 text-sm text-slate-400">{t("no_bookings")}</p>}
              </div>
            </div>

            <div>
              <h3 className="font-display font-semibold text-slate-900 mb-3">{t("warn_owner")}</h3>
              <Textarea data-testid="admin-warn-message" value={warnMsg} onChange={(e) => setWarnMsg(e.target.value)}
                placeholder={t("warning_message")} rows={2} />
              <Button data-testid="admin-warn-button" size="sm" onClick={sendWarning} disabled={warnMsg.trim().length < 3}
                className="mt-2 bg-amber-500 hover:bg-amber-600 text-white rounded-full">
                {t("send_warning")}
              </Button>
            </div>

            <div className="border-t border-slate-200 pt-5">
              <h3 className="font-display font-semibold text-slate-900 mb-3">{t("actions")}</h3>
              <div className="flex flex-wrap gap-2">
                {o.account_status !== "active" && (
                  <ConfirmAction t={t} testid="admin-activate-button" label={t("activate_account")}
                    className="border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                    description={t("confirm_destructive")} onConfirm={() => accountAction("activate")} />
                )}
                {o.account_status === "active" && (
                  <ConfirmAction t={t} testid="admin-suspend-button" label={t("suspend_account")}
                    className="border-amber-300 text-amber-700 hover:bg-amber-50"
                    onConfirm={() => accountAction("suspend")} />
                )}
                {o.account_status !== "banned" && o.account_status !== "deleted" && (
                  <ConfirmAction t={t} testid="admin-ban-button" label={t("ban_account")}
                    className="border-rose-300 text-rose-600 hover:bg-rose-50"
                    onConfirm={() => accountAction("ban")} />
                )}
                {o.account_status !== "deleted" && (
                  <ConfirmAction t={t} testid="admin-delete-button" label={t("delete_account")}
                    className="bg-rose-600 text-white hover:bg-rose-700 border-rose-600"
                    onConfirm={() => accountAction("delete")} />
                )}
              </div>
            </div>
          </div>
        )}

        <FieldFormDialog open={fieldDialog} onOpenChange={setFieldDialog} field={editField} onSave={saveField} />
      </DialogContent>
    </Dialog>
  );
}
