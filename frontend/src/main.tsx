import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("No #root element found");

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Register Service Worker after the app has mounted so it doesn't block
// the initial render.  The SW scope covers "/" which includes /api/* and
// /static/* so it can intercept all relevant fetch requests.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((err: unknown) => {
      console.warn("Service Worker registration failed:", err);
    });
  });
}
