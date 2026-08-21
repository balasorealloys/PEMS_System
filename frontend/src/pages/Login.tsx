import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  ArrowRight, Eye, EyeOff, Gauge, KeyRound, Leaf, LineChart, Lock, Moon, ShieldCheck, Sun, User, Zap,
} from "lucide-react";
import { useAuth } from "../stores/auth";
import balLogo from "../assets/bal-logo.png";
import bg1 from "../assets/login/bg1.png";
import bg2 from "../assets/login/bg2.png";
import bg3 from "../assets/login/bg3.png";
import bg4 from "../assets/login/bg4.png";

const SLIDES = [bg1, bg2, bg3, bg4];

/* Theme: default by time of day on first visit, then remembered (localStorage).
   Applied to <html data-theme> so it carries into the app after sign-in. */
function useLoginTheme() {
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    const saved = localStorage.getItem("pems.theme");
    if (saved === "dark" || saved === "light") return saved;
    const h = new Date().getHours();
    return h >= 6 && h < 18 ? "light" : "dark";
  });
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("pems.theme", theme);
  }, [theme]);
  return { theme, toggle: () => setTheme((t) => (t === "dark" ? "light" : "dark")) };
}

const FEATURES = [
  { icon: Gauge, label: "Real-time\nMonitoring" },
  { icon: LineChart, label: "Advanced\nAnalytics" },
  { icon: ShieldCheck, label: "Reliable &\nSecure" },
  { icon: Leaf, label: "Energy\nEfficiency" },
];

export default function Login() {
  const login = useAuth((s) => s.login);
  const { theme, toggle } = useLoginTheme();
  const [empid, setEmpid] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [slide, setSlide] = useState(0);

  // rotate the hero background every 6s (crossfade)
  useEffect(() => {
    const id = setInterval(() => setSlide((s) => (s + 1) % SLIDES.length), 6000);
    return () => clearInterval(id);
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null); setBusy(true);
    try {
      await login(empid.trim(), password);
    } catch (e) {
      setErr(String(e).includes("401") ? "Invalid username or password." : "Sign-in failed. Please try again.");
    } finally { setBusy(false); }
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-[#f1f5f9] p-4 dark:bg-[#050a14]">
      {/* theme toggle */}
      <button onClick={toggle} title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
        className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-border/60 bg-card/70 text-muted-foreground backdrop-blur transition hover:text-foreground">
        {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
      </button>

      <div className="grid w-full max-w-5xl overflow-hidden rounded-3xl border border-border/60 bg-card shadow-2xl lg:grid-cols-2">
        {/* ---------- brand hero: rotating energy imagery + branding overlay ---------- */}
        <div className="relative hidden flex-col justify-between overflow-hidden p-10 lg:flex" style={{ background: "#081019" }}>
          {/* rotating background photos (crossfade) */}
          {SLIDES.map((src, i) => (
            <div key={i} aria-hidden className="absolute inset-0 bg-cover bg-center transition-opacity duration-[1500ms] ease-in-out"
              style={{ backgroundImage: `url(${src})`, opacity: i === slide ? 1 : 0, transform: i === slide ? "scale(1.05)" : "scale(1)", transitionProperty: "opacity, transform", transitionDuration: "1500ms, 7000ms" }} />
          ))}
          {/* scrim so the overlaid text stays legible */}
          <div aria-hidden className="absolute inset-0"
            style={{ background: "linear-gradient(165deg, rgba(8,16,25,.78) 0%, rgba(8,16,25,.45) 42%, rgba(8,16,25,.72) 78%, rgba(8,16,25,.92) 100%)" }} />
          <div className="relative z-10">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30">
                <Zap size={22} />
              </div>
              <div>
                <div className="text-2xl font-extrabold tracking-tight text-white">PEMS</div>
                <div className="text-[11px] leading-tight text-slate-400">Power &amp; Energy<br />Management System</div>
              </div>
            </div>
            <h1 className="mt-12 text-4xl font-extrabold leading-tight text-white">
              Powering <span className="text-emerald-400">Efficiency.</span><br />
              Driving <span className="text-emerald-400">Excellence.</span>
            </h1>
            <div className="mt-4 h-1 w-12 rounded-full bg-emerald-400" />
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-slate-400">
              Real-time monitoring, analytics and insights for a smarter, greener tomorrow.
            </p>
          </div>

          {/* feature chips */}
          <div className="relative z-10 mt-10 grid grid-cols-4 gap-3 rounded-2xl border border-white/10 bg-black/25 p-4 backdrop-blur-sm">
            {FEATURES.map((f) => (
              <div key={f.label} className="flex flex-col items-center gap-2 text-center">
                <f.icon size={22} className="text-emerald-400" />
                <span className="whitespace-pre-line text-[11px] leading-tight text-slate-200">{f.label}</span>
              </div>
            ))}
          </div>

          {/* slide indicators */}
          <div className="absolute bottom-4 right-6 z-10 flex items-center gap-1.5">
            {SLIDES.map((_, i) => (
              <button key={i} aria-label={`Slide ${i + 1}`} onClick={() => setSlide(i)}
                className="h-1.5 rounded-full transition-all"
                style={{ width: i === slide ? 20 : 6, background: i === slide ? "#34d399" : "rgba(255,255,255,.4)" }} />
            ))}
          </div>
        </div>

        {/* ---------- form panel (theme-aware) ---------- */}
        <div className="flex flex-col justify-center px-8 py-10 sm:px-12">
          <div className="mb-6 flex items-center justify-center gap-2.5 text-foreground">
            <img src={balLogo} alt="Balasore Alloys Limited" className="h-9 w-auto" />
            <div className="leading-none">
              <div className="text-sm font-bold tracking-wide">BALASORE ALLOYS</div>
              <div className="text-[10px] tracking-[0.3em] text-muted-foreground">LIMITED</div>
            </div>
          </div>

          <div className="text-center">
            <h2 className="text-3xl font-extrabold tracking-tight">Welcome <span className="text-emerald-500">Back!</span></h2>
            <p className="mt-1 text-sm text-muted-foreground">Sign in to continue to PEMS</p>
          </div>

          <form onSubmit={submit} className="mt-8 space-y-4">
            <Field label="Username">
              <User size={16} className="field-ic" />
              <input className="field-in" value={empid} onChange={(e) => setEmpid(e.target.value)} autoFocus
                autoComplete="username" placeholder="Enter your Employee ID" />
            </Field>
            <Field label="Password">
              <Lock size={16} className="field-ic" />
              <input className="field-in pr-10" type={show ? "text" : "password"} value={password}
                onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" placeholder="Enter your password" />
              <button type="button" onClick={() => setShow((s) => !s)} tabIndex={-1}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {show ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </Field>

            <div className="flex justify-end">
              <button type="button" className="text-xs font-medium text-emerald-600 hover:underline dark:text-emerald-400"
                onClick={() => toast.info("Password reset", { description: "Reset your password on the Balasore intranet portal." })}>
                Forgot Password?
              </button>
            </div>

            {err && <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-400">{err}</div>}

            <button type="submit" disabled={busy || !empid || !password}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-600/20 transition hover:opacity-95 disabled:opacity-50">
              {busy ? "Signing in…" : "Sign In"} <ArrowRight size={16} />
            </button>

            <div className="flex items-center gap-3 py-1 text-xs text-muted-foreground">
              <div className="h-px flex-1 bg-border" /> or <div className="h-px flex-1 bg-border" />
            </div>

            <button type="button"
              onClick={() => toast.info("Single sign-on", { description: "PEMS already uses your intranet ID — enter your Employee ID and password above." })}
              className="flex w-full items-center justify-center gap-2 rounded-xl border py-3 text-sm font-semibold transition hover:bg-accent">
              <ShieldCheck size={16} /> Sign in with SSO
            </button>

            <div className="flex items-center justify-center gap-1.5 pt-1 text-[11px] text-muted-foreground">
              <KeyRound size={12} /> Secured with enterprise-grade encryption
            </div>
          </form>
        </div>
      </div>

      <div className="mt-6 text-center text-[11px] text-muted-foreground">© 2026 Balasore Alloys Limited. All rights reserved.</div>

      <style>{`
        .field-ic{position:absolute;left:12px;top:50%;transform:translateY(-50%);color:#94a3b8;pointer-events:none}
        .field-in{width:100%;border-radius:12px;border:1px solid hsl(var(--border));background:hsl(var(--background));padding:12px 12px 12px 38px;font-size:14px;outline:none}
        .field-in:focus{border-color:#10b981;box-shadow:0 0 0 3px rgba(16,185,129,.12)}
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium">{label}</label>
      <div className="relative">{children}</div>
    </div>
  );
}
