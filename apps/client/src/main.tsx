import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "next-themes";
import "./index.css";
// Initialises i18next and stamps <html lang/dir> before the first render, so an
// Urdu session never paints left-to-right and then flips.
import "./i18n";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {/*
      The `class` strategy matches the Tailwind dark variant already configured
      in index.css (`@custom-variant dark (&:is(.dark *))`). `system` is the
      default so the OS preference wins until the user says otherwise.
    */}
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <App />
    </ThemeProvider>
  </StrictMode>,
);
