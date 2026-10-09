import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { applyTheme, storedTheme } from "./lib/theme";

// tema salvo neste aparelho já na primeira pintura (sem piscar o escuro)
applyTheme(storedTheme());

createRoot(document.getElementById("root")!).render(<App />);
