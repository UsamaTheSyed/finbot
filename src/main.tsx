import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/inter/800.css";
import "./styles/global.css";
import "./styles/verified-screens.css";
import "./styles/phase-two.css";
import "./styles/phase-six.css";
import { applyTokens } from "./styles/tokens";
import { AppProviders } from "./app/providers/AppProviders";
// Use the router directory explicitly. This avoids resolving a legacy
// src/app/router.tsx file ahead of src/app/router/index.tsx.
import { router } from "./app/router/index";
applyTokens();
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  </React.StrictMode>,
);
