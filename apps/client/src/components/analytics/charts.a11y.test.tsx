import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { axe } from "jest-axe";
import { DataTable } from "./charts";
import { KpiCard } from "../dashboard/KpiCard";

/**
 * Accessibility assertions (Phase 6.7).
 *
 * axe-core catches the structural failures that are easy to introduce and hard
 * to notice: a table without header scope, a control with no accessible name,
 * text below the contrast floor. These run on the pieces every dashboard is
 * built from, so a regression in one shows up everywhere at once.
 */

describe("analytics table accessibility", () => {
  it("has no axe violations", async () => {
    const { container } = render(
      <DataTable
        columns={[
          { key: "medicine", label: "Medicine" },
          { key: "quantity", label: "Qty", align: "right" },
        ]}
        rows={[
          { medicine: "Amoxicillin", quantity: 4 },
          { medicine: "Ibuprofen", quantity: 0 },
        ]}
      />,
    );

    expect(await axe(container)).toHaveNoViolations();
  });

  it("marks every column header as a header for its column", async () => {
    // Without scope, a screen reader cannot announce which column a cell is in,
    // which makes a stock table unreadable rather than merely awkward.
    const { container } = render(
      <DataTable columns={[{ key: "a", label: "Medicine" }]} rows={[{ a: "x" }]} />,
    );

    const headers = container.querySelectorAll("th");
    expect(headers.length).toBeGreaterThan(0);
    for (const th of headers) {
      expect(th.getAttribute("scope")).toBe("col");
    }
  });
});

describe("KPI card accessibility", () => {
  it("has no axe violations", async () => {
    const { container } = render(
      <KpiCard kpi={{ key: "revenue", label: "Revenue today", value: 1240, unit: "currency" }} />,
    );

    expect(await axe(container)).toHaveNoViolations();
  });

  it("exposes the label as text rather than relying on visual grouping", () => {
    const { getByText } = render(
      <KpiCard kpi={{ key: "noShow", label: "No-show rate", value: "12%" }} />,
    );

    expect(getByText("No-show rate")).toBeTruthy();
    expect(getByText("12%")).toBeTruthy();
  });
});
