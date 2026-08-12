import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { seedIfEmpty } from "./seed";
import "./styles.css";

seedIfEmpty()
  .catch((e) => console.error("Seeding failed", e))
  .finally(() => {
    ReactDOM.createRoot(document.getElementById("root")!).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
  });
