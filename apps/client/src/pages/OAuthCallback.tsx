import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../store/authStore";
import { authApi } from "../api/auth";

/**
 * Lands the Google OAuth redirect (Phase 6.6).
 *
 * The server returns the token pair in the URL **fragment**, which browsers
 * never send to a server — so the tokens stay out of access logs, the Referer
 * header, and any proxy in between, unlike a `?token=` query string.
 *
 * The fragment is stripped from history immediately after it is read, so the
 * back button cannot resurface a token.
 *
 * The `consumed` guard makes the read one-shot. React StrictMode mounts this
 * component twice in development (mount → cleanup → mount), and the first run
 * strips the fragment — without the guard the second run would find no tokens
 * and report a spurious failure. The `me()` continuation must not be cancelled
 * in a cleanup for the same reason.
 */
export default function OAuthCallback() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);
  const { t } = useTranslation("auth");
  const [error, setError] = useState<string | null>(null);
  const consumed = useRef(false);

  // Consuming a one-time credential from the URL is imperative bootstrap work,
  // not data fetching — it must happen exactly once, on mount.
  useEffect(() => {
    if (consumed.current) return;
    consumed.current = true;

    const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const accessToken = params.get("accessToken");
    const refreshToken = params.get("refreshToken");

    if (!accessToken) {
      setError(t("oauthIncomplete"));
      return;
    }

    localStorage.setItem("accessToken", accessToken);
    if (refreshToken) localStorage.setItem("refreshToken", refreshToken);

    // Drop the tokens out of the address bar and history before anything else.
    window.history.replaceState(null, "", window.location.pathname);

    authApi
      .me()
      .then((user) => {
        setAuth(user, accessToken);
        // OAuth is patients-only, so the destination is never in doubt.
        navigate("/patient", { replace: true });
      })
      .catch(() => {
        setError(t("oauthAccountLoadFailed"));
      });
  }, [navigate, setAuth, t]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/60 p-6">
      {error ? (
        <div role="alert" className="max-w-sm text-center">
          <p className="text-sm text-red-600">{error}</p>
          <button
            type="button"
            onClick={() => navigate("/login", { replace: true })}
            className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            {t("backToSignIn")}
          </button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{t("signingYouIn")}</p>
      )}
    </div>
  );
}
