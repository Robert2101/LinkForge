import { useRef, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router";
import { LoaderCircle } from "lucide-react";
import { useAuth } from "../auth/AuthContext.jsx";

// The sign-in and create-account pages. They share one form.

function AuthForm({ mode }) {
  const isRegister = mode === "register";
  const { status, user, login, register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const formRef = useRef(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);

  // After signing in, return to the page that asked for it.
  const destination = location.state?.from ?? "/dashboard";

  if (status === "ready" && user) return <Navigate to={destination} replace />;

  async function handleSubmit(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const details = { email: form.get("email").trim(), password: form.get("password") };
    const name = form.get("name")?.trim();
    if (isRegister && name) details.name = name;

    setPending(true);
    setError(null);
    try {
      await (isRegister ? register(details) : login(details));
      navigate(destination, { replace: true });
    } catch (failure) {
      setError(failure);
      setPending(false);
      const firstBadField = ["name", "email", "password"].find((field) => failure.fieldError?.(field));
      requestAnimationFrame(() => formRef.current?.elements[firstBadField ?? "email"]?.focus());
    }
  }

  const fieldError = (field) => error?.fieldError?.(field);
  const generalError = error && !["name", "email", "password"].some(fieldError) ? error.message : null;

  return (
    <div className="mx-auto max-w-md px-5 py-14 sm:py-20">
      <h1 className="display text-4xl">{isRegister ? "Create your account" : "Sign in"}</h1>
      <p className="mt-3 text-muted">
        {isRegister ? "Keep your links in one place and see who clicks them." : "Open your links and their analytics."}
      </p>

      <form ref={formRef} onSubmit={handleSubmit} noValidate className="mt-8 space-y-5">
        {generalError && (
          <p role="alert" className="rounded-md bg-danger-wash px-4 py-3 text-sm font-medium text-danger">
            {generalError}
          </p>
        )}

        {isRegister && (
          <div>
            <label htmlFor="name" className="label">
              Name <span className="font-normal text-muted">(optional)</span>
            </label>
            <input
              id="name"
              name="name"
              type="text"
              autoComplete="name"
              maxLength={120}
              aria-invalid={fieldError("name") ? "true" : undefined}
              aria-describedby={fieldError("name") ? "name-error" : undefined}
              className="input"
            />
            {fieldError("name") && (
              <p id="name-error" className="field-error">
                {fieldError("name")}
              </p>
            )}
          </div>
        )}

        <div>
          <label htmlFor="email" className="label">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            required
            aria-invalid={fieldError("email") ? "true" : undefined}
            aria-describedby={fieldError("email") ? "email-error" : undefined}
            className="input"
          />
          {fieldError("email") && (
            <p id="email-error" className="field-error">
              {fieldError("email")}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="password" className="label">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete={isRegister ? "new-password" : "current-password"}
            required
            aria-invalid={fieldError("password") ? "true" : undefined}
            aria-describedby="password-help"
            className="input"
          />
          <p id="password-help" className={fieldError("password") ? "field-error" : "mt-1.5 text-sm text-muted"}>
            {fieldError("password") ??
              (isRegister ? "At least 8 characters, with an uppercase letter, a lowercase letter and a number." : "")}
          </p>
        </div>

        <button type="submit" className="btn btn-primary w-full" disabled={pending}>
          {pending && <LoaderCircle aria-hidden="true" className="spinner size-4" />}
          {isRegister ? (pending ? "Creating account…" : "Create account") : pending ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <p className="mt-6 text-sm text-muted">
        {isRegister ? "Already have an account? " : "New to LinkForge? "}
        <Link to={isRegister ? "/login" : "/register"} state={location.state} className="link font-semibold text-ink">
          {isRegister ? "Sign in" : "Create an account"}
        </Link>
      </p>
    </div>
  );
}

export const Login = () => <AuthForm key="login" mode="login" />;
export const Register = () => <AuthForm key="register" mode="register" />;
