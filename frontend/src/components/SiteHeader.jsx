import { Link, useNavigate } from "react-router";
import { LogOut } from "lucide-react";
import { useAuth } from "../auth/AuthContext.jsx";
import { useToast } from "./Toast.jsx";

export function Wordmark() {
  return (
    <Link to="/" translate="no" className="display text-xl tracking-tight">
      Link<span className="text-ember">Forge</span>
    </Link>
  );
}

// The bar at the top of every page. What it offers depends on whether
// someone is signed in.
export function SiteHeader() {
  const { status, user, logout } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  async function signOut() {
    // Leave the protected page first. Otherwise, the moment the user becomes
    // null, that page's own guard would redirect to /login.
    navigate("/");
    await logout();
    toast("Signed out");
  }

  return (
    <header className="border-b border-line">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-ink focus:px-3 focus:py-2 focus:text-white"
      >
        Skip to content
      </a>
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5 sm:px-8">
        <Wordmark />

        {status === "ready" && (
          <nav aria-label="Account" className="flex items-center gap-1 sm:gap-2">
            {user ? (
              <>
                <Link to="/dashboard" className="btn btn-quiet">
                  Dashboard
                </Link>
                <span className="hidden max-w-48 truncate text-sm text-muted md:inline" title={user.email}>
                  {user.email}
                </span>
                <button type="button" onClick={signOut} className="btn btn-quiet">
                  <LogOut aria-hidden="true" className="size-4" />
                  {/* On small screens only the icon shows; the text stays for screen readers. */}
                  <span className="sr-only sm:not-sr-only">Sign out</span>
                </button>
              </>
            ) : (
              <>
                <Link to="/login" className="btn btn-quiet">
                  Sign in
                </Link>
                <Link to="/register" className="btn btn-secondary">
                  Create account
                </Link>
              </>
            )}
          </nav>
        )}
      </div>
    </header>
  );
}
