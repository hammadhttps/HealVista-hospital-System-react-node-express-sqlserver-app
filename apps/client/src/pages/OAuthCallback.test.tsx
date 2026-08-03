import { describe, it, expect, vi, beforeEach } from "vitest";
import { StrictMode } from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { authApi } from "../api/auth";
import { useAuthStore } from "../store/authStore";
import OAuthCallback from "./OAuthCallback";

vi.mock("../api/auth", () => ({
  authApi: { me: vi.fn() },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        oauthIncomplete: "Sign-in did not complete. Please try again.",
        oauthAccountLoadFailed: "Could not load your account. Please sign in again.",
        backToSignIn: "Back to sign in",
        signingYouIn: "Signing you in…",
      };
      return map[key] ?? key;
    },
  }),
}));

const me = vi.mocked(authApi.me);

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/oauth/callback"]}>
      <Routes>
        <Route path="/oauth/callback" element={<OAuthCallback />} />
        <Route path="/patient" element={<div>Patient dashboard</div>} />
        <Route path="/login" element={<div>Login page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("OAuthCallback", () => {
  beforeEach(() => {
    localStorage.clear();
    window.location.hash = "";
    vi.clearAllMocks();
    useAuthStore.setState({ user: null, accessToken: null });
  });

  it("stores tokens, calls me once, strips the fragment, and lands on /patient", async () => {
    window.location.hash = "#accessToken=acc123&refreshToken=ref456";
    me.mockResolvedValue({ id: "p1", email: "a@b.com", role: "PATIENT" });

    renderPage();

    expect(me).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem("accessToken")).toBe("acc123");
    expect(localStorage.getItem("refreshToken")).toBe("ref456");

    await waitFor(() => expect(screen.getByText("Patient dashboard")).toBeTruthy());
    expect(window.location.hash).toBe("");
    expect(useAuthStore.getState().user?.role).toBe("PATIENT");
  });

  it("shows an error when no access token is present and never calls me", () => {
    window.location.hash = "#refreshToken=ref456";

    renderPage();

    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByText(/did not complete/i)).toBeTruthy();
    expect(me).not.toHaveBeenCalled();
  });

  it("shows an error when the me() call fails", async () => {
    window.location.hash = "#accessToken=acc123";
    me.mockRejectedValue(new Error("network"));

    renderPage();

    await screen.findByText(/could not load your account/i);
  });

  it("survives a StrictMode double-mount without double-consuming the fragment", async () => {
    window.location.hash = "#accessToken=acc123&refreshToken=ref456";
    // Keep me() pending so the second StrictMode mount's state is observable
    // before navigation unmounts the page.
    let resolveMe!: (v: { id: string; email: string; role: string }) => void;
    me.mockReturnValue(new Promise((resolve) => (resolveMe = resolve)));

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <StrictMode>
          <MemoryRouter initialEntries={["/oauth/callback"]}>
            <Routes>
              <Route path="/oauth/callback" element={<OAuthCallback />} />
              <Route path="/patient" element={<div>Patient dashboard</div>} />
            </Routes>
          </MemoryRouter>
        </StrictMode>,
      );
    });

    // The second StrictMode mount must be a no-op: exactly one me() call and
    // no spurious failure while the first call is still in flight.
    expect(me).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/did not complete/i)).toBeNull();

    await act(async () => {
      resolveMe({ id: "p1", email: "a@b.com", role: "PATIENT" });
    });
    await waitFor(() => expect(screen.getByText("Patient dashboard")).toBeTruthy());

    act(() => root.unmount());
    container.remove();
  });
});
