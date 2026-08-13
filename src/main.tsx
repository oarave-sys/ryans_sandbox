import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

// Standalone demo build (VITE_DEMO=1): seed in-browser sample data before render.
if ((import.meta as { env?: Record<string, string | undefined> }).env?.VITE_DEMO === "1") {
  import("./demoSeed").then((m) => m.seedDemo()).catch(() => {});
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
