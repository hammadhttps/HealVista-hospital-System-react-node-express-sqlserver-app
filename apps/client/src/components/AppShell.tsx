import { useEffect, useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import Sidebar from "./Layout/Sidebar";
import Header from "./Layout/Header";
import ActingBanner from "./Layout/ActingBanner";
import { CommandPalette } from "./search/CommandPalette";

interface GoToMap { 
  [key: string]: string;
}

interface TypingTarget extends EventTarget {
  readonly tagName?: string;
  readonly isContentEditable?: boolean;
}

/**
 * Staff keyboard shortcuts (Phase 6.7).
 *
 * `g` then a letter — the vim-style leader pattern staff already know from other
 * tools. Deliberately not modifier-based: a clinician's hands stay on the
 * keyboard and single letters do not collide with browser or OS shortcuts.
 */
const GO_TO: GoToMap = {
  d: "/",
  p: "/patients",
  a: "/patient/appointments",
  q: "/doctor/queue",
};

export function AppShell() {
  const [paletteOpen, setPaletteOpen] = useState<boolean>(false);
  const navigate = useNavigate();
  const { t } = useTranslation("a11y");

  // Global keyboard shortcuts. A document listener is imperative wiring, not
  // data fetching, and is cleaned up on unmount.
  useEffect(() => {
    let awaitingGo = false;
    let goTimer: ReturnType<typeof setTimeout>;

    function isTyping(target: EventTarget | null): boolean {
      const el = target as TypingTarget | null;
      if (!el) return false;
      return (
        el.tagName === "INPUT" ||
        el.tagName === "TEXTAREA" ||
        el.tagName === "SELECT" ||
        el.isContentEditable === true
      );
    }

    function onKeyDown(event: KeyboardEvent): void {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
        return;
      }

      // Single-letter shortcuts must never fire while the user is writing a
      // clinical note.
      if (event.metaKey || event.ctrlKey || event.altKey || isTyping(event.target)) return;

      const key = event.key.toLowerCase();

      if (awaitingGo) {
        awaitingGo = false;
        clearTimeout(goTimer);
        const destination = GO_TO[key];
        if (destination) {
          event.preventDefault();
          navigate(destination);
        }
        return;
      }

      if (key === "g") {
        awaitingGo = true;
        // The leader lapses, so a stray "g" cannot hijack the next keystroke.
        goTimer = setTimeout(() => {
          awaitingGo = false;
        }, 1500);
      } else if (key === "n") {
        event.preventDefault();
        navigate("/doctors");
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      clearTimeout(goTimer);
    };
  }, [navigate]);

  return (
    <div className="flex min-h-screen bg-gray-100 dark:bg-gray-900">
      {/*
        Visible only on focus: the first Tab on any page jumps past the whole
        sidebar straight to the content.
      */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:start-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-blue-700 focus:px-4 focus:py-2 focus:text-white"
      >
        {t("skipToContent")}
      </a>

      <Sidebar />
      <div className="flex flex-1 flex-col">
        <Header onOpenSearch={() => setPaletteOpen(true)} />
        <ActingBanner />
        <main id="main-content" tabIndex={-1} className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
      {/*
        Everyone gets the palette, patients included — the server scopes results
        to what the caller may see, so a patient searching finds their own
        appointments and bills and nothing else.
      */}
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
