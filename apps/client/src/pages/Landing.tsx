import { Link } from "react-router-dom";
import { HeartPulse, Stethoscope, Calendar, Shield } from "lucide-react";
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
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100">
      <header className="flex items-center justify-between px-8 py-4 bg-white/80 backdrop-blur border-b">
        <div className="flex items-center gap-2">
          <HeartPulse className="w-8 h-8 text-green-600" />
          <span className="text-xl font-bold text-green-800">{t("common:appName")}</span>
        </div>
        <Link
          to="/login"
          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
        >
          {t("auth:signIn")}
        </Link>
      </header>
      <main className="max-w-5xl mx-auto px-4 py-20 text-center">
        <h1 className="text-5xl font-bold text-green-900 mb-6">{t("landing:heroTitle")}</h1>
        <p className="text-xl text-green-700 mb-12 max-w-2xl mx-auto">{t("landing:heroBody")}</p>
        <div className="grid md:grid-cols-3 gap-8 mb-16">
          {FEATURES.map(({ icon: Icon, titleKey, descKey }) => (
            <div key={titleKey} className="bg-white p-6 rounded-xl shadow-md text-left">
              <Icon className="w-10 h-10 text-green-500 mb-3" />
              <h3 className="text-lg font-semibold text-green-900 mb-2">{t(titleKey)}</h3>
              <p className="text-gray-600">{t(descKey)}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
