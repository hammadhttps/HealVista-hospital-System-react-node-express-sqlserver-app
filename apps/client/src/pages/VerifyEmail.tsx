import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { authApi } from "../api/auth";
import { toast } from "sonner";

export default function VerifyEmail() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { t } = useTranslation("auth");
  const token = params.get("token");

  useEffect(() => {
    if (token) {
      authApi
        .verifyEmail(token)
        .then(() => {
          toast.success(t("emailVerified"));
          navigate("/login");
        })
        .catch(() => {
          toast.error(t("verificationFailed"));
        });
    }
  }, [token, navigate, t]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <p>{t("verifyingEmail")}</p>
    </div>
  );
}
