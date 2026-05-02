import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";

// Register the Service Worker so the app and stem audio work offline.
// The SW is served at /sw.js (root scope) via the backend's dedicated route,
// which sets the Service-Worker-Allowed: / header so it can intercept all
// requests regardless of the /static/ asset base path.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .catch((err: unknown) => {
        console.warn("SW registration failed:", err);
      });
  });
}

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("No #root element found");

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
