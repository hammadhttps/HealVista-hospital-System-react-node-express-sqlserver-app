import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "./Layout/Sidebar";
import Header from "./Layout/Header";
import ActingBanner from "./Layout/ActingBanner";
import { CommandPalette } from "./search/CommandPalette";

export function AppShell() {
  const [paletteOpen, setPaletteOpen] = useState(false);

  // Global Cmd/Ctrl+K. A keyboard listener on document is imperative wiring, not
  // data fetching, and is cleaned up on unmount.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="min-h-screen flex bg-gray-100 dark:bg-gray-900">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Header onOpenSearch={() => setPaletteOpen(true)} />
        <ActingBanner />
        <main className="flex-1 p-6 overflow-y-auto">
          <Outlet />
        </main>
      </div>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
