import { Component, type ComponentType, type ErrorInfo, type ReactNode } from "react";
import { withTranslation } from "react-i18next";
import { AlertTriangle, RotateCcw, Home } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

/**
 * Global error boundary (Phase 6.8).
 *
 * The lazy-loaded route chunks suspend inside `<Suspense>`, but a component that
 * throws while *rendering* escapes that — without a boundary the whole root
 * unmounts to a blank white screen. This catches those, shows a recoverable
 * message, and lets the user either retry the render or head home.
 *
 * `key` is the reset mechanism: the route tree passes `location.key`, so any
 * navigation remounts the boundary fresh and clears the error.
 */
class ErrorBoundaryBase extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Deliberately logged, not surfaced: stack traces belong in the console,
    // and the on-screen copy is the user-facing fallback.
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    const { t } = this.props as Props & { t: (key: string) => string };

    return (
      <div
        role="alert"
        className="flex min-h-screen flex-col items-center justify-center gap-4 bg-muted/60 p-6 text-center"
      >
        <AlertTriangle
          aria-hidden="true"
          className="h-12 w-12 text-amber-500 dark:text-amber-400"
        />
        <h1 className="text-xl font-semibold text-foreground">{t("common:errorTitle")}</h1>
        <p className="max-w-md text-sm text-muted-foreground">{t("common:errorBoundaryBody")}</p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => this.setState({ hasError: false })}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            {t("common:tryAgain")}
          </button>
          <a
            href="/"
            className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <Home className="h-4 w-4" aria-hidden="true" />
            {t("common:goHome")}
          </a>
        </div>
      </div>
    );
  }
}

const ErrorBoundary = withTranslation()(ErrorBoundaryBase) as ComponentType<Props>;

export { ErrorBoundary };
export default ErrorBoundary;
