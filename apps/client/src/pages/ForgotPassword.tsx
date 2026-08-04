import { useState } from "react";
import { Link } from "react-router-dom";
import { HeartPulse, Mail, ArrowLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { authApi } from "../api/auth";
import { getErrorMessage } from "../utils/errors";

export default function ForgotPassword() {
  const { t } = useTranslation(["auth"]);
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await authApi.resendVerification(email);
      setSent(true);
    } catch (err: any) {
      setError(getErrorMessage(err, t("auth:verificationSendFailed")));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-teal-50 via-teal-50/70 to-cyan-100">
      <div className="bg-white p-8 rounded-xl shadow-2xl w-full max-w-md">
        <div className="flex flex-col items-center mb-6">
          <HeartPulse className="w-12 h-12 text-teal-600 mb-2" />
          <h1 className="text-2xl font-bold text-teal-800">{t("auth:resetPassword")}</h1>
        </div>
        {sent ? (
          <div className="text-center space-y-4">
            <div className="p-4 bg-teal-50 text-teal-700 rounded-lg">
              {t("auth:verificationSent", { email })}
            </div>
            <Link
              to="/login"
              className="inline-flex items-center gap-2 text-teal-600 hover:underline"
            >
              <ArrowLeft className="w-4 h-4" /> {t("auth:backToLogin")}
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">
                {t("auth:email")}
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                <input
                  type="email"
                  className="w-full pl-10 pr-4 py-3 border rounded-lg focus:ring-2 focus:ring-teal-400"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder={t("auth:emailPlaceholder")}
                />
              </div>
            </div>
            {error && <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg">{error}</div>}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-teal-600 hover:bg-teal-700 text-white font-semibold py-3 rounded-lg transition disabled:opacity-75"
            >
              {loading ? t("auth:sending") : t("auth:sendVerification")}
            </button>
            <div className="text-center">
              <Link to="/login" className="text-sm text-teal-600 hover:underline">
                {t("auth:backToLogin")}
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
