import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { axe } from "jest-axe";

/**
 * Accessibility assertions on the three flows that carry the most real-world
 * traffic (Phase 6.9): the patient login, the clinician dashboard, and the
 * reception waiting-room screen. Each renders a whole page (with its data hooks
 * stubbed) so axe checks the composition, not just a single isolated control.
 */

const tStub = (key: string) => key;

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => tStub(key) }),
}));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return {
    ...actual,
    Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => (
      <a href={to} {...rest}>
        {children}
      </a>
    ),
    useSearchParams: () => [new URLSearchParams()],
    useParams: () => ({ doctorId: "dr-1" }),
  };
});

describe("patient login flow accessibility", () => {
  vi.mock("../hooks/mutations/useAuthMutations", () => ({
    useLogin: () => ({ mutate: vi.fn(), isPending: false, isError: false, error: null }),
  }));

  it("has no axe violations", { timeout: 15_000 }, async () => {
    const { default: LoginPage } = await import("./Login");
    const { container } = render(<LoginPage />);
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("doctor dashboard accessibility", () => {
  vi.mock("../hooks/queries/useDashboard", () => ({
    useDashboard: () => ({
      data: {
        role: "DOCTOR",
        kpis: [
          { key: "todayScheduled", label: "Scheduled today", value: 8 },
          { key: "todayWaiting", label: "Waiting today", value: 3 },
          { key: "pendingNotes", label: "Pending notes", value: 2 },
          { key: "criticalResults", label: "Critical results", value: 1 },
        ],
        sections: [
          {
            title: "Today's queue",
            items: [
              {
                id: "a1",
                label: "Ahmed Raza",
                subtitle: "09:30",
                meta: "CHECKED_IN",
                href: "/consultation/a1",
              },
            ],
          },
        ],
      },
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    }),
  }));

  it("has no axe violations", { timeout: 15_000 }, async () => {
    const { RoleDashboard } = await import("../components/dashboard/RoleDashboard");
    const { container } = render(<RoleDashboard title="Doctor dashboard" />);
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("reception queue display accessibility", () => {
  vi.mock("../hooks/queries/useAppointments", () => ({
    useQueue: () => ({
      data: [
        {
          id: "t1",
          tokenNumber: 3,
          status: "waiting",
          appointment: { patient: { fullName: "Fatima Iqbal" } },
        },
      ],
      isLoading: false,
      isError: false,
    }),
  }));

  it("has no axe violations", { timeout: 15_000 }, async () => {
    const { default: QueueDisplay } = await import("./QueueDisplay");
    const { container } = render(<QueueDisplay />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
