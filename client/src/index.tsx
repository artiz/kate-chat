import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Provider } from "react-redux";
import { store } from "./store";
import App from "./components/App";

import "./index.scss";
import "katex/dist/katex.css";
import "./assets/katex-overrides.css";

// Ensure the container exists
const container = document.getElementById("root");
if (!container) throw new Error("Root element not found");

const root = createRoot(container);

root.render(
  <React.StrictMode>
    <Provider store={store}>
      <BrowserRouter
        future={{
          v7_relativeSplatPath: true,
          v7_startTransition: true,
        }}
      >
        <App />
      </BrowserRouter>
    </Provider>
  </React.StrictMode>
);
