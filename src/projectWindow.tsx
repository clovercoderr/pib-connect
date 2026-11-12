import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import NewProjectWindow from "./components/project/NewProjectWindow";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <NewProjectWindow />
  </StrictMode>
);
