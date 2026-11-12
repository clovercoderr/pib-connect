import { StrictMode, Component, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { SettingsPage } from "./components/settings/SettingsPage";

type ErrorBoundaryState = {
  hasError: boolean;
  errorMessage: string;
};

class SettingsErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: "" };
  }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error instanceof Error ? error.message : "Unknown settings error",
    };
  }

  componentDidCatch(error: unknown) {
    console.error("Settings window crashed:", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen w-screen bg-[#111118] text-white flex items-center justify-center px-6">
          <div className="max-w-md w-full rounded-xl border border-red-500/20 bg-red-500/10 p-4">
            <h1 className="text-sm font-semibold text-red-300">Settings crashed</h1>
            <p className="mt-2 text-xs text-red-200/90 break-words">{this.state.errorMessage}</p>
            <button
              className="mt-4 px-3 py-1.5 rounded-md bg-white/10 hover:bg-white/20 text-xs transition-colors"
              onClick={() => window.location.reload()}
            >
              Reload settings
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <SettingsErrorBoundary>
      <SettingsPage />
    </SettingsErrorBoundary>
  </StrictMode>
);
