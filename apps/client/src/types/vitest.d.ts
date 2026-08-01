import "vitest";

/**
 * Registers the `toHaveNoViolations` matcher that `src/test/setup.ts` adds via
 * `expect.extend`, so the accessibility tests typecheck.
 *
 * The `import` above is load-bearing: module augmentation only applies in a file
 * with module scope. Its counterpart `jest-axe.d.ts` must stay ambient.
 */
declare module "vitest" {
  interface Assertion<T = unknown> {
    toHaveNoViolations(): T;
  }
  interface AsymmetricMatchersContaining {
    toHaveNoViolations(): void;
  }
}
