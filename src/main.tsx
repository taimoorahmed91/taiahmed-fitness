import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { enableTouchActive } from "./lib/touchActive";
import "./index.css";

// iOS Safari only shows :active (the button press effect) when the page has a touch listener.
enableTouchActive();

createRoot(document.getElementById("root")!).render(<App />);
