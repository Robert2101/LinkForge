import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Navigate, useLocation } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import * as session from "../lib/api.js";

// Who is signed in, available to every component through useAuth().
//
//   status: "loading"  the app just opened and is asking the server
//           "ready"    we know: `user` is the account, or null when signed out

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [state, setState] = useState({ status: "loading", user: null });
  const queryClient = useQueryClient();

  useEffect(() => {
    // The api module tells us about every change (login, logout, expiry).
    const unsubscribe = session.onSessionChange((user) => setState({ status: "ready", user }));

    // On page load, try to continue the previous session with the refresh cookie.
    session.restoreSession().catch(() => setState({ status: "ready", user: null }));

    return unsubscribe;
  }, []);

  const value = useMemo(
    () => ({
      ...state,
      login: session.login,
      register: session.register,
      async logout() {
        await session.logout();
        queryClient.clear(); // never show one account's data to the next person
      },
    }),
    [state, queryClient]
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside <AuthProvider>");
  return context;
}

// Wrap pages that need an account. Signed-out visitors are sent to the login
// page, which sends them back here afterwards.
export function RequireAuth({ children }) {
  const { status, user } = useAuth();
  const location = useLocation();

  if (status === "loading") return <PageLoading />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return children;
}

export function PageLoading() {
  return (
    <p className="px-6 py-24 text-center text-muted" role="status">
      Loading…
    </p>
  );
}
