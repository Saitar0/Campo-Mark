import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useLang, COUNTRIES } from "../context/LangContext";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { Checkbox } from "./ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";

const AMENITIES = ["bola", "coletes", "iluminacao", "vestiario", "arbitragem", "estacionamento", "churrasqueira", "bar"];

const emptyForm = {
  name: "", field_type: "society", description: "", address: "", city: "", neighborhood: "",
  country: "BR", photos: "", amenities: [], slot_duration_minutes: 60, weekly_schedule: {},
  cancel_hours: 24, refund_percent: 100, accept_online: true, accept_on_site: true,
};

function ScheduleEditor({ value, onChange, t }) {
  const days = t("days");
  const setWindows = (day, windows) => onChange({ ...value, [day]: windows });
  return (
    <div className="space-y-3">
      {[0, 1, 2, 3, 4, 5, 6].map((day) => {
        const windows = value[String(day)] || [];
        return (
          <div key={day} className="border border-slate-200 rounded-xl p-3">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-sm text-slate-800">{days[day]}</span>
              <button type="button" data-testid={`add-window-${day}`}
                onClick={() => setWindows(String(day), [...windows, { start: "18:00", end: "22:00", price: 150 }])}
                className="text-xs text-emerald-600 font-semibold hover:underline">
                + {t("add_window")}
              </button>
            </div>
            {windows.map((w, i) => (
              <div key={i} className="flex items-center gap-2 mt-2">
                <Input type="time" value={w.start} className="w-24"
                  onChange={(e) => setWindows(String(day), windows.map((x, j) => j === i ? { ...x, start: e.target.value } : x))} />
                <Input type="time" value={w.end} className="w-24"
                  onChange={(e) => setWindows(String(day), windows.map((x, j) => j === i ? { ...x, end: e.target.value } : x))} />
                <Input type="number" min="1" step="0.01" value={w.price} className="w-24" placeholder="R$"
                  onChange={(e) => setWindows(String(day), windows.map((x, j) => j === i ? { ...x, price: parseFloat(e.target.value) || 0 } : x))} />
                <button type="button" data-testid={`remove-window-${day}-${i}`}
                  onClick={() => setWindows(String(day), windows.filter((_, j) => j !== i))}
                  className="text-slate-400 hover:text-rose-600">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

export default function FieldFormDialog({ open, onOpenChange, field, onSave, saving }) {
  const { t } = useLang();
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    if (open) {
      setForm(field
        ? { ...emptyForm, ...field, photos: (field.photos || []).join("\n"), weekly_schedule: field.weekly_schedule || {} }
        : emptyForm);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, field]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const toggleAmenity = (a) =>
    setForm((f) => ({ ...f, amenities: f.amenities.includes(a) ? f.amenities.filter((x) => x !== a) : [...f.amenities, a] }));

  const submit = () => {
    onSave({
      ...form,
      photos: form.photos.split("\n").map((s) => s.trim()).filter(Boolean),
      slot_duration_minutes: parseInt(form.slot_duration_minutes) || 60,
      cancel_hours: parseInt(form.cancel_hours) || 0,
      refund_percent: parseInt(form.refund_percent) || 0,
    }, field?.id || null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{field ? t("edit_field") : t("add_field")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-5 pb-2">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <Label>{t("field_name")}</Label>
              <Input data-testid="field-name-input" value={form.name} onChange={set("name")} className="mt-1.5" />
            </div>
            <div>
              <Label>{t("all_types")}</Label>
              <Select value={form.field_type} onValueChange={(v) => setForm((f) => ({ ...f, field_type: v }))}>
                <SelectTrigger data-testid="field-type-select" className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="society">{t("society")}</SelectItem>
                  <SelectItem value="futsal">{t("futsal")}</SelectItem>
                  <SelectItem value="campo">{t("campo")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t("country")}</Label>
              <Select value={form.country} onValueChange={(v) => setForm((f) => ({ ...f, country: v }))}>
                <SelectTrigger data-testid="field-country-select" className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {COUNTRIES.map((c) => <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t("city")}</Label>
              <Input data-testid="field-city-input" value={form.city} onChange={set("city")} className="mt-1.5" />
            </div>
            <div>
              <Label>{t("neighborhood")}</Label>
              <Input data-testid="field-neighborhood-input" value={form.neighborhood} onChange={set("neighborhood")} className="mt-1.5" />
            </div>
            <div className="sm:col-span-2">
              <Label>{t("address")}</Label>
              <Input data-testid="field-address-input" value={form.address} onChange={set("address")} className="mt-1.5" />
            </div>
            <div className="sm:col-span-2">
              <Label>{t("description")}</Label>
              <Textarea data-testid="field-description-input" value={form.description} onChange={set("description")} className="mt-1.5" rows={2} />
            </div>
            <div className="sm:col-span-2">
              <Label>{t("photos")}</Label>
              <Textarea data-testid="field-photos-input" value={form.photos} onChange={set("photos")} className="mt-1.5 font-mono text-xs" rows={3} />
            </div>
          </div>

          <div>
            <Label>{t("amenities_label")}</Label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2">
              {AMENITIES.map((a) => (
                <label key={a} data-testid={`amenity-${a}`} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                  <Checkbox checked={form.amenities.includes(a)} onCheckedChange={() => toggleAmenity(a)} />
                  {t(`amenity_${a}`)}
                </label>
              ))}
            </div>
          </div>

          <div className="grid sm:grid-cols-3 gap-4">
            <div>
              <Label>{t("slot_duration")}</Label>
              <Input data-testid="field-slot-duration-input" type="number" min="30" max="180" step="30"
                value={form.slot_duration_minutes} onChange={set("slot_duration_minutes")} className="mt-1.5" />
            </div>
            <div>
              <Label>{t("cancel_hours")}</Label>
              <Input data-testid="field-cancel-hours-input" type="number" min="0"
                value={form.cancel_hours} onChange={set("cancel_hours")} className="mt-1.5" />
            </div>
            <div>
              <Label>{t("refund_percent")}</Label>
              <Input data-testid="field-refund-input" type="number" min="0" max="100"
                value={form.refund_percent} onChange={set("refund_percent")} className="mt-1.5" />
            </div>
          </div>

          <div>
            <Label>{t("accepts")}</Label>
            <div className="flex gap-6 mt-2">
              <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                <Checkbox data-testid="accept-online-checkbox" checked={form.accept_online}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, accept_online: !!v }))} />
                {t("online")}
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                <Checkbox data-testid="accept-on-site-checkbox" checked={form.accept_on_site}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, accept_on_site: !!v }))} />
                {t("on_site")}
              </label>
            </div>
          </div>

          <div>
            <Label className="mb-2 block">{t("weekly_schedule")}</Label>
            <ScheduleEditor value={form.weekly_schedule} t={t}
              onChange={(ws) => setForm((f) => ({ ...f, weekly_schedule: ws }))} />
          </div>

          <Button data-testid="field-save-button" onClick={submit} disabled={saving}
            className="w-full bg-emerald-500 hover:bg-emerald-600 text-white rounded-full py-5 active:scale-95 transition-transform">
            {t("save")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
