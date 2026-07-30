import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { authApi } from "../api/auth";
import { toast } from "sonner";

export default function VerifyEmail() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get("token");

  useEffect(() => {
    if (token) {
      authApi
        .verifyEmail(token)
        .then(() => {
          toast.success("Email verified!");
          navigate("/login");
        })
        .catch(() => {
          toast.error("Verification failed");
        });
    }
  }, [token, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <p>Verifying your email...</p>
    </div>
  );
}
