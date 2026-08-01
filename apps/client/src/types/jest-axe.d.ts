/**
 * Ambient types for `jest-axe`, which ships none.
 *
 * This file must contain **no top-level import or export**: that would make it a
 * module, and `declare module "jest-axe"` would then be read as an augmentation
 * of an already-typed module rather than the declaration it needs to be.
 * The Vitest matcher augmentation lives in `vitest.d.ts` for the same reason,
 * in reverse — it *does* need module scope.
 */
declare module "jest-axe" {
  interface AxeViolation {
    id: string;
    impact?: string;
    description: string;
    help: string;
    nodes: unknown[];
  }

  interface AxeResults {
    violations: AxeViolation[];
    passes: unknown[];
  }

  function axe(container: Element | Document, options?: Record<string, unknown>): Promise<AxeResults>;

  const toHaveNoViolations: {
    toHaveNoViolations(results: AxeResults): { pass: boolean; message: () => string };
  };

  export { axe, toHaveNoViolations };
  export type { AxeResults, AxeViolation };
}
