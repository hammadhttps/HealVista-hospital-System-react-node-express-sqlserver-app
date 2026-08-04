import { Link } from "react-router-dom";
import { Calendar, HeartPulse, Shield, Stethoscope } from "lucide-react";
import { useTranslation } from "react-i18next";

const FEATURES = [
  {
    icon: Stethoscope,
    titleKey: "landing:clinicalCore",
    descKey: "landing:clinicalCoreDesc",
  },
  {
    icon: Calendar,
    titleKey: "landing:smartScheduling",
    descKey: "landing:smartSchedulingDesc",
  },
  {
    icon: Shield,
    titleKey: "landing:roleAccess",
    descKey: "landing:roleAccessDesc",
  },
] as const;

export default function Landing() {
  const { t } = useTranslation(["landing", "auth", "common"]);
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="flex items-center justify-between border-b border-border bg-card/90 px-5 py-4 shadow-sm backdrop-blur sm:px-8">
        <div className="flex items-center gap-2">
          <span className="flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <HeartPulse className="h-6 w-6" />
          </span>
          <span className="text-xl font-bold text-primary">{t("common:appName")}</span>
        </div>
        <Link
          to="/login"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition hover:bg-primary/90"
        >
          {t("auth:signIn")}
        </Link>
      </header>
      <main className="mx-auto grid min-h-[calc(100vh-73px)] max-w-7xl items-center gap-10 px-5 py-10 lg:grid-cols-[1.05fr_0.95fr] lg:px-8">
        <section className="max-w-3xl">
          <div className="mb-7 inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium text-muted-foreground shadow-sm">
            <Shield className="h-4 w-4 text-primary" />
            Role-based hospital operations
          </div>
          <h1 className="text-4xl font-bold leading-tight tracking-normal text-foreground sm:text-5xl lg:text-6xl">
            {t("landing:heroTitle")}
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">
            {t("landing:heroBody")}
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              to="/login"
              className="rounded-md bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90"
            >
              {t("auth:signIn")}
            </Link>
          </div>
        </section>

        <section className="rounded-lg border border-border bg-card p-4 shadow-xl shadow-slate-950/5">
          <div className="rounded-md border border-border bg-muted/50 p-4">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-muted-foreground">Today at HealVista</div>
                <div className="text-2xl font-semibold text-foreground">Live operations</div>
              </div>
              <img src="/logo/logo.png" alt="" className="h-12 w-12 rounded-md object-contain" />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                ["24", "patients"],
                ["9", "doctors"],
                ["7", "roles"],
              ].map(([value, label]) => (
                <div key={label} className="rounded-md border border-border bg-background p-4">
                  <div className="text-2xl font-semibold text-primary">{value}</div>
                  <div className="text-sm text-muted-foreground">{label}</div>
                </div>
              ))}
            </div>
            <div className="mt-4 grid gap-3">
              {FEATURES.map(({ icon: Icon, titleKey, descKey }) => (
                <div
                  key={titleKey}
                  className="flex gap-3 rounded-md border border-border bg-background p-4"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" />
                  </span>
                  <div>
                    <h3 className="font-semibold text-foreground">{t(titleKey)}</h3>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">{t(descKey)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="grid gap-4 lg:col-span-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, titleKey, descKey }) => (
            <article key={titleKey} className="rounded-lg border border-border bg-card p-5">
              <Icon className="mb-3 h-6 w-6 text-primary" />
              <h3 className="text-base font-semibold text-foreground">{t(titleKey)}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{t(descKey)}</p>
            </article>
          ))}
        </section>
      </main>
    </div>
  );
}
