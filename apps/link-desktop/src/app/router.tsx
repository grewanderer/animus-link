import { Navigate, createBrowserRouter } from "react-router-dom";

import { AppShell } from "../components/AppShell";
import { DiagnosticsPage } from "../pages/DiagnosticsPage";
import { MeshesPage } from "../pages/MeshesPage";
import { MessengerPage } from "../pages/MessengerPage";
import { OnboardingPage } from "../pages/OnboardingPage";
import { RelayPage } from "../pages/RelayPage";
import { ServicesPage } from "../pages/ServicesPage";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to="/onboarding" replace /> },
      { path: "onboarding", element: <OnboardingPage /> },
      { path: "meshes", element: <MeshesPage /> },
      { path: "relay", element: <RelayPage /> },
      { path: "services", element: <ServicesPage /> },
      { path: "messenger", element: <MessengerPage /> },
      { path: "diagnostics", element: <DiagnosticsPage /> },
    ],
  },
]);
