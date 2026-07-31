import { useState } from "react";
import { useAuthStore } from "../store/authStore";
import { authApi } from "../api/auth";
import { useSessions } from "../hooks/queries/useAuth";
import { useQueryClient } from "@tanstack/react-query";
import { authKeys } from "../hooks/queries/useAuth";
import { getErrorMessage } from "../utils/errors";

export default function AccountSettings() {
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const { data: sessions } = useSessions();
  const [passwords, setPasswords] = useState({ current: "", newPw: "" });
  const [emailForm, setEmailForm] = useState({ email: "", password: "" });
  const [phoneForm, setPhoneForm] = useState({ phone: "", password: "" });
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg("");
    setErr("");
    try {
      await authApi.changePassword(passwords.current, passwords.newPw);
      setMsg("Password changed.");
      setPasswords({ current: "", newPw: "" });
    } catch (err: any) {
      setErr(getErrorMessage(err, "Failed"));
    }
  };

  const handleChangeEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg("");
    setErr("");
    try {
      await authApi.changeEmail(emailForm.email, emailForm.password);
      setMsg("Email changed. Verify your new email.");
      setEmailForm({ email: "", password: "" });
    } catch (err: any) {
      setErr(getErrorMessage(err, "Failed"));
    }
  };

  const handleRevoke = async (id: string) => {
    await authApi.revokeSession(id);
    queryClient.invalidateQueries({ queryKey: authKeys.sessions });
  };

  return (
    <div className="max-w-2xl space-y-8">
      <h1 className="text-2xl font-bold text-gray-800">Account Settings</h1>

      <div className="bg-white rounded-xl shadow-sm p-6 space-y-2">
        <h2 className="text-lg font-semibold text-gray-700 mb-3">Profile</h2>
        <p className="text-gray-600">
          Email: <strong>{user?.email}</strong>
        </p>
        <p className="text-gray-600">
          Role: <strong>{user?.role}</strong>
        </p>
      </div>

      <form onSubmit={handleChangePassword} className="bg-white rounded-xl shadow-sm p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-700">Change Password</h2>
        <input
          type="password"
          placeholder="Current password"
          className="w-full px-4 py-2 border rounded-lg"
          value={passwords.current}
          onChange={(e) => setPasswords({ ...passwords, current: e.target.value })}
          required
        />
        <input
          type="password"
          placeholder="New password (min 8 chars)"
          className="w-full px-4 py-2 border rounded-lg"
          value={passwords.newPw}
          onChange={(e) => setPasswords({ ...passwords, newPw: e.target.value })}
          required
          minLength={8}
        />
        <button
          type="submit"
          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
        >
          Change Password
        </button>
      </form>

      <form onSubmit={handleChangeEmail} className="bg-white rounded-xl shadow-sm p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-700">Change Email</h2>
        <input
          type="email"
          placeholder="New email"
          className="w-full px-4 py-2 border rounded-lg"
          value={emailForm.email}
          onChange={(e) => setEmailForm({ ...emailForm, email: e.target.value })}
          required
        />
        <input
          type="password"
          placeholder="Confirm password"
          className="w-full px-4 py-2 border rounded-lg"
          value={emailForm.password}
          onChange={(e) => setEmailForm({ ...emailForm, password: e.target.value })}
          required
        />
        <button
          type="submit"
          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
        >
          Change Email
        </button>
      </form>

      <div className="bg-white rounded-xl shadow-sm p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-700">Active Sessions</h2>
        {(sessions as any[])?.length === 0 ? (
          <p className="text-gray-500">No active sessions.</p>
        ) : (
          <div className="space-y-2">
            {(sessions as any[])?.map((s: any) => (
              <div
                key={s.id}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
              >
                <div>
                  <p className="text-sm font-medium">{s.ipAddress || "Unknown IP"}</p>
                  <p className="text-xs text-gray-500">
                    Last active: {new Date(s.lastActiveAt).toLocaleString()}
                  </p>
                </div>
                <button
                  onClick={() => handleRevoke(s.id)}
                  className="text-sm text-red-500 hover:text-red-700"
                >
                  Revoke
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {msg && <div className="p-3 bg-green-50 text-green-700 rounded-lg">{msg}</div>}
      {err && <div className="p-3 bg-red-50 text-red-600 rounded-lg">{err}</div>}
    </div>
  );
}
