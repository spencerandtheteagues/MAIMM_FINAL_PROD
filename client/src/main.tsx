import { initializeTheme } from "./lib/theme";
import { createRoot } from "react-dom/client";
try { initializeTheme(); } catch {}
import App from "./App";
import "./index.css";
import { initializeTheme } from "./lib/theme";

// Initialize theme before app renders
initializeTheme();

createRoot(document.getElementById("root")!).render(<App />);
