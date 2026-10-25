import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AppProvider } from "./lib/appContext";
import { App } from "./App";
import "./styles/app.css";

const container = document.getElementById("root");
if (!container) {
  throw new Error("TradeVault could not start: #root is missing from index.html.");
}

createRoot(container).render(
  <StrictMode>
    <AppProvider>
      <App />
    </AppProvider>
  </StrictMode>
);
