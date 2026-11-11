import { lazy, Suspense } from "react";
import { Link, Outlet, Route, Routes } from "react-router";
import { PageLoading, RequireAuth } from "./auth/AuthContext.jsx";
import { SiteHeader } from "./components/SiteHeader.jsx";
import Landing from "./pages/Landing.jsx";
import { Login, Register } from "./pages/AuthPages.jsx";

// The signed-in pages are loaded only when someone opens them, which keeps
// the first visit to the home page small and fast.
const Dashboard = lazy(() => import("./pages/Dashboard.jsx"));
const LinkDetail = lazy(() => import("./pages/LinkDetail.jsx"));

// Every page shares the same header and footer.
function Layout() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main id="main" className="flex-1">
        <Suspense fallback={<PageLoading />}>
          <Outlet />
        </Suspense>
      </main>
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-6 text-sm text-muted sm:px-8">
          <p>LinkForge, a URL shortener built with Node.js, PostgreSQL and Redis.</p>
          <a href="https://github.com/Robert2101/LinkForge" target="_blank" rel="noreferrer" className="link">
            Source on GitHub
          </a>
        </div>
      </footer>
    </div>
  );
}

function NotFound() {
  return (
    <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
      <h1 className="display text-5xl">Page not found</h1>
      <p className="mt-4 text-muted">There is nothing at this address.</p>
      <Link to="/" className="btn btn-primary mt-8">
        Go to the home page
      </Link>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Landing />} />
        <Route path="login" element={<Login />} />
        <Route path="register" element={<Register />} />
        <Route
          path="dashboard"
          element={
            <RequireAuth>
              <Dashboard />
            </RequireAuth>
          }
        />
        <Route
          path="links/:id"
          element={
            <RequireAuth>
              <LinkDetail />
            </RequireAuth>
          }
        />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
