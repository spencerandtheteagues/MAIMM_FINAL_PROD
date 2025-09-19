import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { initializeTheme } from "./lib/theme";

// Initialize theme before app renders
initializeTheme();

createRoot(document.getElementById("root")!).render(<App />);
