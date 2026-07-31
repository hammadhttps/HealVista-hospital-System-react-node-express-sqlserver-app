import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { LogIn, HeartPulse } from "lucide-react";
import { useLogin } from "../hooks/mutations/useAuthMutations";
import { getErrorMessage } from "../utils/errors";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const login = useLogin();
  const navigate = useNavigate();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    login.mutate({ email, password });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-green-100">
      <div className="bg-white p-8 rounded-xl shadow-2xl w-full max-w-md">
        <div className="flex flex-col items-center mb-6">
          <HeartPulse className="w-12 h-12 text-green-600 mb-2" />
          <h1 className="text-3xl font-bold text-green-800">HealVista</h1>
          <p className="text-green-600 text-sm mt-1">Hospital Management System</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Email</label>
            <input
              type="email"
              className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-green-400 focus:border-transparent"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Password</label>
            <input
              type="password"
              className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-green-400 focus:border-transparent"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="Enter password"
            />
          </div>

          {login.isError && (
            <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg">
              {getErrorMessage(login.error, "Login failed")}
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
                <LogIn className="w-5 h-5" /> Sign In
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
