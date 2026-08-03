import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { axe } from "jest-axe";
import { ThemeToggle } from "./ThemeToggle";

/**
 * Theme switching (Phase 6.7). The toggle is the only place a user changes
 * appearance, so both the three-way choice and the `aria-checked` state are
 * pinned here. The `attribute="class"` strategy means a picked theme must be
 * written back so Tailwind's `dark:` variant can match on the `<html>` element.
 */

const setTheme = vi.fn();

vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "system", setTheme }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe("ThemeToggle", () => {
  it("is announced as a radio group with a checked option", async () => {
    const { container } = render(<ThemeToggle />);
    const group = screen.getByRole("radiogroup");
    expect(group.getAttribute("aria-label")).toBeTruthy();
    const radios = screen.getAllByRole("radio");
    expect(radios.length).toBe(3);
    const checked = radios.filter((r) => r.getAttribute("aria-checked") === "true");
    expect(checked.length).toBe(1);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("writes a picked theme back for the class strategy", () => {
    render(<ThemeToggle />);
    fireEvent.click(screen.getByRole("radio", { name: "themeDark" }));
    expect(setTheme).toHaveBeenCalledWith("dark");
  });
});
