import { expect } from "vitest";
import { toHaveNoViolations } from "jest-axe";

/**
 * Global test setup.
 *
 * Registers the axe matcher so `expect(await axe(container)).toHaveNoViolations()`
 * reports the specific rule that failed rather than just "false is not true".
 */
expect.extend(toHaveNoViolations);
