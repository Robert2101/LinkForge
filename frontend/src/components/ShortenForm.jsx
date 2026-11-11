import { useId, useRef, useState } from "react";
import { ChevronDown, LoaderCircle } from "lucide-react";
import { useCreateLink } from "../lib/queries.js";
import { withScheme } from "../lib/format.js";

// The form that makes a short link. Used on the home page and the dashboard.
// The inputs are uncontrolled (read on submit), so typing never re-renders the form.
export function ShortenForm({ onCreated }) {
  const createLink = useCreateLink();
  const [showOptions, setShowOptions] = useState(false);
  const formRef = useRef(null);
  const id = useId();

  const error = createLink.error;
  const urlError = error?.fieldError("originalUrl");
  const aliasError = error?.fieldError("customAlias") ?? (error?.status === 409 ? error.message : undefined);
  const expiryError = error?.fieldError("expiresAt");
  const generalError = error && !urlError && !aliasError && !expiryError ? error.message : undefined;

  function handleSubmit(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    const body = { originalUrl: withScheme(form.get("originalUrl")) };
    const alias = form.get("customAlias")?.trim();
    const expires = form.get("expiresAt");
    if (alias) body.customAlias = alias;
    if (expires) body.expiresAt = new Date(expires).toISOString();

    createLink.mutate(body, {
      onSuccess(link) {
        formRef.current?.reset();
        onCreated(link);
      },
      onError(failure) {
        // Put the cursor where the problem is.
        const field = ["originalUrl", "customAlias", "expiresAt"].find(
          (name) => failure.fieldError?.(name) || (name === "customAlias" && failure.status === 409)
        );
        if (field === "customAlias" || field === "expiresAt") setShowOptions(true);
        requestAnimationFrame(() => formRef.current?.elements[field ?? "originalUrl"]?.focus());
      },
    });
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} noValidate>
      <label htmlFor={`${id}-url`} className="label">
        Long URL
      </label>
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          id={`${id}-url`}
          name="originalUrl"
          type="text"
          inputMode="url"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          required
          placeholder="https://example.com/a/very/long/address…"
          aria-invalid={urlError ? "true" : undefined}
          aria-describedby={urlError ? `${id}-url-error` : undefined}
          className="input min-h-13 flex-1 font-mono text-[0.95rem]"
        />
        <button type="submit" className="btn btn-primary min-h-13 px-6 text-base" disabled={createLink.isPending}>
          {createLink.isPending && <LoaderCircle aria-hidden="true" className="spinner size-4" />}
          {createLink.isPending ? "Shortening…" : "Shorten link"}
        </button>
      </div>
      {urlError && (
        <p id={`${id}-url-error`} className="field-error" role="alert">
          {urlError}
        </p>
      )}
      {generalError && (
        <p className="field-error" role="alert">
          {generalError}
        </p>
      )}

      <button
        type="button"
        onClick={() => setShowOptions((open) => !open)}
        aria-expanded={showOptions}
        aria-controls={`${id}-options`}
        className="btn btn-quiet -ml-2.5 mt-2 text-sm"
      >
        <ChevronDown
          aria-hidden="true"
          className={`size-4 transition-transform duration-150 ${showOptions ? "rotate-180" : ""}`}
        />
        Custom name and expiry
      </button>

      <div id={`${id}-options`} hidden={!showOptions} className="mt-2 grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={`${id}-alias`} className="label">
            Custom name <span className="font-normal text-muted">(optional)</span>
          </label>
          <input
            id={`${id}-alias`}
            name="customAlias"
            type="text"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={30}
            placeholder="spring-sale…"
            aria-invalid={aliasError ? "true" : undefined}
            aria-describedby={`${id}-alias-help`}
            className="input font-mono"
          />
          <p id={`${id}-alias-help`} className={aliasError ? "field-error" : "mt-1.5 text-sm text-muted"}>
            {aliasError ?? "3 to 30 letters, numbers, hyphens or underscores."}
          </p>
        </div>
        <div>
          <label htmlFor={`${id}-expires`} className="label">
            Stops working on <span className="font-normal text-muted">(optional)</span>
          </label>
          <input
            id={`${id}-expires`}
            name="expiresAt"
            type="datetime-local"
            autoComplete="off"
            aria-invalid={expiryError ? "true" : undefined}
            aria-describedby={`${id}-expires-help`}
            className="input"
          />
          <p id={`${id}-expires-help`} className={expiryError ? "field-error" : "mt-1.5 text-sm text-muted"}>
            {expiryError ?? "Leave empty to keep the link forever."}
          </p>
        </div>
      </div>
    </form>
  );
}
