import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Skeleton, CardSkeleton, TableSkeleton } from "./Skeleton";

describe("Skeleton", () => {
  it("renders with default classes", () => {
    const { container } = render(<Skeleton />);
    expect(container.firstChild).toBeTruthy();
    expect((container.firstChild as HTMLElement).className).toContain("animate-pulse");
  });

  it("renders with custom className", () => {
    const { container } = render(<Skeleton className="w-48 h-8" />);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain("w-48");
    expect(el.className).toContain("h-8");
  });

  it("CardSkeleton renders", () => {
    const { container } = render(<CardSkeleton />);
    expect(container.firstChild).toBeTruthy();
  });

  it("TableSkeleton renders with default 5 rows", () => {
    const { container } = render(<TableSkeleton />);
    expect(container.firstChild?.childNodes).toHaveLength(5);
  });
});
