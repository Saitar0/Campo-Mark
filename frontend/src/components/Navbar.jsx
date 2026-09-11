import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Bell, Globe, LogOut, Moon, Sun, User as UserIcon } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useLang, COUNTRIES } from "../context/LangContext";
import api from "../lib/api";
import { Button } from "../components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";

export default function Navbar() {
  const { user, logout } = useAuth();
  const { lang, setLang, country, setCountry, t } = useLang();
  const navigate = useNavigate();
  const [unread, setUnread] = useState(0);
  const [notifs, setNotifs] = useState([]);
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  const [fieldCountries, setFieldCountries] = useState([]);

  useEffect(() => {
    api.get("/fields/countries").then((r) => setFieldCountries(r.data.map((c) => c.country))).catch(() => {});
  }, []);

  useEffect(() => {
    if (user && user.role !== "admin") {
      api.get("/notifications").then((r) => {
        setNotifs(r.data);
        setUnread(r.data.filter((n) => !n.read).length);
      }).catch(() => {});
    }
  }, [user]);

  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("campomark_theme", next ? "dark" : "light");
  };

  const markRead = async () => {
    await api.post("/notifications/read-all").catch(() => {});
    setUnread(0);
    setNotifs((ns) => ns.map((n) => ({ ...n, read: true })));
  };

  const countryOptions = [...new Set([...fieldCountries, ...(country ? [country] : [])])];

  return (
    <header className="fixed top-0 inset-x-0 z-50 h-16 sm:h-20 backdrop-blur-xl bg-white/80 dark:bg-[#0B0F17]/80 border-b border-slate-200 dark:border-slate-800">
      <div className="max-w-7xl mx-auto h-full px-4 sm:px-6 flex items-center justify-between gap-4">
        <Link to="/" data-testid="nav-logo" className="flex items-center gap-2 shrink-0">
          <span className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center">
            <span className="w-3.5 h-3.5 rounded-full border-2 border-white" />
          </span>
          <span className="font-display font-extrabold text-xl tracking-tight text-slate-900 dark:text-white">
            Campo<span className="text-emerald-500">Mark</span>
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-1 text-sm font-medium">
          <Link to="/" data-testid="nav-explore-link" className="px-3 py-2 rounded-lg text-slate-600 dark:text-slate-300 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-colors">
            {t("nav_explore")}
          </Link>
          {user?.role === "customer" && (
            <Link to="/minhas-reservas" data-testid="nav-my-bookings-link" className="px-3 py-2 rounded-lg text-slate-600 dark:text-slate-300 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-colors">
              {t("nav_my_bookings")}
            </Link>
          )}
          {user?.role === "owner" && (
            <Link to="/painel" data-testid="nav-dashboard-link" className="px-3 py-2 rounded-lg text-slate-600 dark:text-slate-300 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-colors">
              {t("nav_dashboard")}
            </Link>
          )}
          {user?.role === "admin" && (
            <Link to="/admin" data-testid="nav-admin-link" className="px-3 py-2 rounded-lg text-slate-600 dark:text-slate-300 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-colors">
              {t("nav_admin")}
            </Link>
          )}
        </nav>

        <div className="flex items-center gap-1.5 sm:gap-3">
          <div className="hidden sm:flex items-center gap-1">
            <Globe className="w-4 h-4 text-slate-400" />
            <Select value={country || "all"} onValueChange={(v) => setCountry(v === "all" ? null : v)}>
              <SelectTrigger data-testid="country-select" className="h-8 w-auto gap-1 border-slate-200 bg-white text-xs font-medium px-2.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("all_countries")}</SelectItem>
                {countryOptions.map((c) => (
                  <SelectItem key={c} value={c}>
                    {(COUNTRIES.find((x) => x.code === c) || {}).name || c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <button data-testid="theme-toggle" onClick={toggleTheme} title={t("theme_toggle")}
            className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            {dark ? <Sun className="w-4.5 h-4.5 w-5 h-5 text-amber-400" /> : <Moon className="w-5 h-5 text-slate-600" />}
          </button>

          <div data-testid="language-toggle" className="flex items-center rounded-full border border-slate-200 bg-white p-0.5 text-xs font-semibold">
            {["pt", "en", "es"].map((l) => (
              <button key={l} data-testid={`lang-${l}`} onClick={() => setLang(l)}
                className={`px-2 py-1 rounded-full transition-colors uppercase ${lang === l ? "bg-emerald-500 text-white" : "text-slate-500 hover:text-slate-800"}`}>
                {l}
              </button>
            ))}
          </div>

          {user && user.role !== "admin" && (
            <DropdownMenu onOpenChange={(open) => open && unread > 0 && markRead()}>
              <DropdownMenuTrigger asChild>
                <button data-testid="notifications-bell" className="relative p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                  <Bell className="w-5 h-5 text-slate-600 dark:text-slate-300" />
                  {unread > 0 && (
                    <span data-testid="notifications-badge" className="absolute -top-0.5 -right-0.5 min-w-[18px] px-1 h-[18px] rounded-full bg-emerald-500 text-white text-[10px] font-bold flex items-center justify-center">
                      {unread}
                    </span>
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-80 max-h-96 overflow-y-auto">
                {notifs.length === 0 && <div className="p-4 text-sm text-slate-500">{t("no_notifications")}</div>}
                {notifs.map((n) => (
                  <DropdownMenuItem key={n.id} className="flex flex-col items-start gap-1 p-3">
                    <span className="font-semibold text-sm">{n.title}</span>
                    <span className="text-xs text-slate-500 whitespace-normal">{n.body}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button data-testid="user-menu-trigger" className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                  {user.picture ? (
                    <img src={user.picture} alt="" className="w-8 h-8 rounded-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <span className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-sm">
                      {user.name?.[0]?.toUpperCase()}
                    </span>
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <div className="px-3 py-2">
                  <p className="font-semibold text-sm">{user.name}</p>
                  <p className="text-xs text-slate-500">{user.email}</p>
                </div>
                <DropdownMenuSeparator />
                {user.role === "customer" && (
                  <DropdownMenuItem data-testid="menu-my-bookings" onClick={() => navigate("/minhas-reservas")}>
                    <UserIcon className="w-4 h-4 mr-2" /> {t("nav_my_bookings")}
                  </DropdownMenuItem>
                )}
                {user.role === "owner" && (
                  <DropdownMenuItem data-testid="menu-dashboard" onClick={() => navigate("/painel")}>
                    <UserIcon className="w-4 h-4 mr-2" /> {t("nav_dashboard")}
                  </DropdownMenuItem>
                )}
                {user.role === "admin" && (
                  <DropdownMenuItem data-testid="menu-admin" onClick={() => navigate("/admin")}>
                    <UserIcon className="w-4 h-4 mr-2" /> {t("nav_admin")}
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem data-testid="logout-button" onClick={async () => { await logout(); navigate("/"); }}>
                  <LogOut className="w-4 h-4 mr-2" /> {t("logout")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button data-testid="nav-login-button" onClick={() => navigate("/auth")}
              className="bg-emerald-500 hover:bg-emerald-600 text-white rounded-full px-5 active:scale-95 transition-transform">
              {t("login")}
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
