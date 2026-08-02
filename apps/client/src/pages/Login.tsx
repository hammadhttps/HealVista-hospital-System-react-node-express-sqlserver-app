import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { LogIn, HeartPulse } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLogin } from "../hooks/mutations/useAuthMutations";
import { getErrorMessage } from "../utils/errors";
import { API_URL } from "../api/axiosClient";

/** The server's OAuth entry point, resolved exactly as the API client resolves. */
const GOOGLE_AUTH_URL = `${API_URL}/auth/google`;

export default function LoginPage() {
  const { t } = useTranslation(["auth", "common"]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const login = useLogin();
  const [searchParams] = useSearchParams();

  // The OAuth callback redirects back here with a reason when it refuses —
  // a staff email, or an unverified Google address.
  const oauthError = searchParams.get("error");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    login.mutate({ email, password });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-green-100">
      <div className="bg-white p-8 rounded-xl shadow-2xl w-full max-w-md">
        <div className="flex flex-col items-center mb-6">
          <HeartPulse className="w-12 h-12 text-green-600 mb-2" />
          <h1 className="text-3xl font-bold text-green-800">{t("common:appName")}</h1>
          <p className="text-green-600 text-sm mt-1">{t("common:tagline")}</p>
        </div>

        {oauthError && (
          <div role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600">
            {oauthError === "oauth" ? t("auth:oauthCancelled") : oauthError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">
              {t("auth:email")}
            </label>
            <input
              type="email"
              className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-green-400 focus:border-transparent"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder={t("auth:emailPlaceholder")}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">
              {t("auth:password")}
            </label>
            <input
              type="password"
              className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-green-400 focus:border-transparent"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder={t("auth:passwordPlaceholder")}
            />
          </div>

          {login.isError && (
            <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg">
              {getErrorMessage(login.error, t("auth:loginFailed"))}
            </div>
          )}

          <button
            type="submit"
            disabled={login.isPending}
            className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white font-semibold py-3 rounded-lg transition disabled:opacity-75"
          >
            {login.isPending ? (
              <span className="animate-spin">⏳</span>
            ) : (
              <>
                <LogIn className="w-5 h-5" /> {t("auth:signIn")}
              </>
            )}
          </button>
        </form>

        {/*
          Patients only. Staff sign in with hospital credentials — the server
          rejects a staff account in the OAuth callback regardless of what the
          UI shows, so this is a signpost, not the control.
        */}
        <div className="mt-6">
          <div className="relative mb-4 text-center">
            <span
              className="absolute inset-x-0 top-1/2 border-t border-gray-200"
              aria-hidden="true"
            />
            <span className="relative bg-white px-3 text-xs text-gray-400">
              {t("auth:patientsCanAlso")}
            </span>
          </div>

          <a
            href={GOOGLE_AUTH_URL}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 py-3 font-medium text-gray-700 transition hover:bg-gray-50"
          >
            <GoogleMark />
            {t("auth:continueWithGoogle")}
          </a>

          <p className="mt-3 text-center text-xs text-gray-400">{t("auth:staffUseCredentials")}</p>
        </div>
      </div>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M21.6 12.2c0-.7-.06-1.4-.18-2.05H12v3.87h5.38a4.6 4.6 0 0 1-2 3.02v2.5h3.24c1.9-1.74 2.98-4.3 2.98-7.34Z"
      />
      <path
        fill="#34A853"
        d="M12 22c2.7 0 4.96-.9 6.62-2.43l-3.24-2.5c-.9.6-2.05.96-3.38.96-2.6 0-4.8-1.75-5.59-4.1H3.06v2.58A10 10 0 0 0 12 22Z"
      />
      <path fill="#FBBC05" d="M6.41 13.93a6 6 0 0 1 0-3.85V7.5H3.06a10 10 0 0 0 0 9l3.35-2.57Z" />
      <path
        fill="#EA4335"
        d="M12 5.98c1.47 0 2.79.5 3.83 1.5l2.87-2.87A10 10 0 0 0 3.06 7.5l3.35 2.58C7.2 7.73 9.4 5.98 12 5.98Z"
      />
    </svg>
  );
}
