import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MapPin, Search, Zap } from "lucide-react";
import api from "../lib/api";
import { useLang, COUNTRIES, money } from "../context/LangContext";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Badge } from "../components/ui/badge";

const HERO_IMG = "https://images.unsplash.com/photo-1517747614396-d21a78b850e8?crop=entropy&cs=srgb&fm=jpg&q=85";
const CITIES = ["Sao Paulo", "Rio de Janeiro", "Curitiba", "Belo Horizonte"];

function FieldCard({ field }) {
  const { t } = useLang();
  const navigate = useNavigate();
  return (
    <div data-testid="field-item-card"
      className="group bg-white rounded-2xl border border-slate-200 overflow-hidden hover:shadow-xl hover:scale-[1.01] transition-all duration-300">
      <div className="relative h-48 overflow-hidden">
        <img src={field.photos?.[0] || HERO_IMG} alt={field.name}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
        <Badge className="absolute top-3 left-3 bg-white/90 text-slate-800 backdrop-blur-sm border-0 font-semibold">
          {t(field.field_type)}
        </Badge>
        <Badge className="absolute top-3 right-3 bg-[#0B0F17]/80 text-white backdrop-blur-sm border-0 font-mono text-xs">
          {field.country || "BR"}
        </Badge>
      </div>
      <div className="p-5">
        <h3 className="font-display font-bold text-lg text-slate-900 leading-snug">{field.name}</h3>
        <p className="text-sm text-slate-500 flex items-center gap-1 mt-1">
          <MapPin className="w-3.5 h-3.5" /> {field.neighborhood}{field.neighborhood ? ", " : ""}{field.city}
        </p>
        <div className="flex items-center justify-between mt-4">
          <div>
            {field.price_from != null && (
              <p className="text-xs text-slate-400">
                {t("from_price")} <span className="font-mono font-semibold text-base text-emerald-600">{money(field.price_from, field.currency)}</span>
                <span className="text-xs text-slate-400"> {t("per_hour")}</span>
              </p>
            )}
          </div>
          <Button data-testid={`field-book-now-button-${field.id}`}
            onClick={() => navigate(`/campo/${field.id}`)}
            className="bg-emerald-500 hover:bg-emerald-600 text-white rounded-full px-5 active:scale-95 transition-transform">
            {t("book_now")}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function Landing() {
  const { t, country } = useLang();
  const navigate = useNavigate();
  const [fields, setFields] = useState([]);
  const [loading, setLoading] = useState(true);
  const [city, setCity] = useState("all");
  const [type, setType] = useState("all");
  const [q, setQ] = useState("");

  useEffect(() => {
    setLoading(true);
    const params = {};
    if (city !== "all") params.city = city;
    if (type !== "all") params.field_type = type;
    if (q) params.q = q;
    if (country) params.country = country;
    api.get("/fields", { params })
      .then((r) => setFields(r.data))
      .catch(() => setFields([]))
      .finally(() => setLoading(false));
  }, [city, type, q, country]);

  const countryName = country ? ((COUNTRIES.find((c) => c.code === country) || {}).name || country) : null;

  return (
    <div className="pt-16 sm:pt-20">
      <section className="relative bg-[#0B0F17] text-white overflow-hidden">
        <div className="absolute inset-0 opacity-25">
          <img src={HERO_IMG} alt="" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#0B0F17] via-[#0B0F17]/80 to-transparent" />
        </div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
          <div data-testid="hero-badge" className="inline-flex items-center gap-2 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-4 py-1.5 text-xs font-medium text-emerald-300 mb-6">
            <Zap className="w-3.5 h-3.5" /> {t("hero_badge")}
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-none max-w-2xl">
            {t("hero_title")}
          </h1>
          <p className="mt-4 text-base sm:text-lg text-slate-300 max-w-xl leading-relaxed">
            {t("hero_subtitle")}
          </p>

          <div className="mt-8 bg-white rounded-2xl p-3 sm:p-4 flex flex-col sm:flex-row gap-3 max-w-3xl shadow-2xl">
            <div className="flex-1 flex items-center gap-2 px-3 rounded-xl border border-slate-200 bg-white">
              <Search className="w-4 h-4 text-slate-400 shrink-0" />
              <Input data-testid="search-field-input" value={q} onChange={(e) => setQ(e.target.value)}
                placeholder={t("search_placeholder")}
                className="border-0 focus-visible:ring-0 text-slate-800 px-0" />
            </div>
            <Select value={city} onValueChange={setCity}>
              <SelectTrigger data-testid="city-filter-select" className="sm:w-48 text-slate-800">
                <SelectValue placeholder={t("all_cities")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("all_cities")}</SelectItem>
                {CITIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger data-testid="field-type-filter" className="sm:w-44 text-slate-800">
                <SelectValue placeholder={t("all_types")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("all_types")}</SelectItem>
                <SelectItem value="society">{t("society")}</SelectItem>
                <SelectItem value="futsal">{t("futsal")}</SelectItem>
                <SelectItem value="campo">{t("campo")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
            {[1, 2, 3].map((i) => <div key={i} className="h-72 rounded-2xl bg-slate-100 animate-pulse" />)}
          </div>
        ) : fields.length === 0 ? (
          <div data-testid="no-fields-message" className="text-center py-16 max-w-lg mx-auto">
            <p className="text-slate-500 text-base">
              {countryName ? t("no_fields_in_country", { "país": countryName }) : t("no_fields")}
            </p>
            {countryName && (
              <Button data-testid="empty-country-cta" onClick={() => navigate("/auth?role=owner")}
                className="mt-6 bg-emerald-500 hover:bg-emerald-600 text-white rounded-full px-8 active:scale-95 transition-transform">
                {t("owner_cta_button")}
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
            {fields.map((f) => <FieldCard key={f.id} field={f} />)}
          </div>
        )}
      </section>

      <section className="bg-[#0B0F17] text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-16 sm:py-20 flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="max-w-xl">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight">{t("owner_cta_title")}</h2>
            <p className="mt-3 text-slate-300 leading-relaxed">{t("owner_cta_text")}</p>
          </div>
          <Button data-testid="owner-cta-button" onClick={() => navigate("/auth?role=owner")}
            className="bg-emerald-500 hover:bg-emerald-600 text-white rounded-full px-8 py-6 text-base font-semibold active:scale-95 transition-transform shrink-0">
            {t("owner_cta_button")}
          </Button>
        </div>
      </section>

      <footer className="bg-[#0B0F17] border-t border-slate-800 text-slate-500 text-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 flex items-center justify-between">
          <span className="font-display font-bold text-slate-300">Campo<span className="text-emerald-500">Mark</span></span>
          <span>© 2026 CampoMark</span>
        </div>
      </footer>
    </div>
  );
}
