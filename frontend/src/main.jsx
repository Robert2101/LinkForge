import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App.jsx";
import { AuthProvider } from "./auth/AuthContext.jsx";
import { ToastProvider } from "./components/Toast.jsx";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000, // data is considered fresh for 30 seconds
      retry: (failures, error) => error.status >= 500 && failures < 2, // retry server errors only
      refetchOnWindowFocus: true,
    },
  },
});

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ToastProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </ToastProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>
);
