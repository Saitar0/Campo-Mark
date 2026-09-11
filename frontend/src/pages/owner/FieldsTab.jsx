import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import api, { formatApiError } from "../../lib/api";
import { useLang } from "../../context/LangContext";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import FieldFormDialog from "../../components/FieldFormDialog";

export default function FieldsTab() {
  const { t } = useLang();
  const [fields, setFields] = useState([]);
  const [dialog, setDialog] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = () => api.get("/owner/fields").then((r) => setFields(r.data)).catch(() => {});
  useEffect(() => { load(); }, []);

  const save = async (payload, editingId) => {
    setSaving(true);
    try {
      if (editingId) await api.put(`/owner/fields/${editingId}`, payload);
      else await api.post("/owner/fields", payload);
      toast.success(t("field_saved"));
      setDialog(false);
      load();
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id) => {
    try {
      await api.delete(`/owner/fields/${id}`);
      toast.success(t("field_deleted"));
      load();
    } catch (e) {
      toast.error(formatApiError(e));
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center">
        <h2 className="font-display font-semibold text-xl text-slate-900">{t("fields_tab")}</h2>
        <Button data-testid="owner-add-field-button" onClick={() => { setEditing(null); setDialog(true); }}
          className="bg-emerald-500 hover:bg-emerald-600 text-white rounded-full active:scale-95 transition-transform">
          <Plus className="w-4 h-4 mr-2" /> {t("add_field")}
        </Button>
      </div>

      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        {fields.map((f) => (
          <div key={f.id} data-testid={`owner-field-card-${f.id}`} className="bg-white rounded-2xl border border-slate-200 overflow-hidden flex">
            <img src={f.photos?.[0]} alt="" className="w-28 h-full object-cover" />
            <div className="p-4 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-display font-bold text-slate-900">{f.name}</h3>
                <Badge className="bg-emerald-100 text-emerald-700 border-0 text-xs">{t(f.field_type)}</Badge>
                <Badge className="bg-slate-100 text-slate-600 border-0 text-xs font-mono">{f.country || "BR"}</Badge>
              </div>
              <p className="text-xs text-slate-500 mt-1">{f.neighborhood}{f.neighborhood ? ", " : ""}{f.city}</p>
              <div className="flex gap-2 mt-3">
                <Button data-testid={`edit-field-${f.id}`} size="sm" variant="outline"
                  onClick={() => { setEditing(f); setDialog(true); }} className="rounded-full">
                  <Pencil className="w-3.5 h-3.5 mr-1.5" /> {t("edit_field")}
                </Button>
                <Button data-testid={`delete-field-${f.id}`} size="sm" variant="outline" onClick={() => remove(f.id)}
                  className="rounded-full border-rose-200 text-rose-600 hover:bg-rose-50">
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <FieldFormDialog open={dialog} onOpenChange={setDialog} field={editing} onSave={save} saving={saving} />
    </div>
  );
}
