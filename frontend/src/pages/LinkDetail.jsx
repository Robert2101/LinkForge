import { useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { ArrowLeft, ExternalLink, Pause, Pencil, Play, Trash2 } from "lucide-react";
import { BreakdownList, ClicksChart, RangePicker, Stat } from "../components/ClicksChart.jsx";
import { ConfirmDialog, Dialog } from "../components/Dialog.jsx";
import { CopyButton, QrButton, StatusBadge } from "../components/LinkActions.jsx";
import { LoadError } from "../components/LoadError.jsx";
import { useToast } from "../components/Toast.jsx";
import {
  countryName,
  formatDate,
  formatDateTime,
  toLocalInputValue,
  withScheme,
  withoutScheme,
} from "../lib/format.js";
import { useDeleteLink, useLinkAnalytics, useUpdateLink } from "../lib/queries.js";

const RANGES = [7, 30, 90];

// One link: its settings and everything we know about its clicks.
export default function LinkDetail() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const days = RANGES.includes(Number(params.get("days"))) ? Number(params.get("days")) : 30;

  const { data, isPending, isError, error, isPlaceholderData, refetch } = useLinkAnalytics(id, days);
  const updateLink = useUpdateLink();
  const deleteLink = useDeleteLink();
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const navigate = useNavigate();
  const toast = useToast();

  const backLink = (
    <Link to="/dashboard" className="btn btn-quiet -ml-2.5">
      <ArrowLeft aria-hidden="true" className="size-4" />
      All links
    </Link>
  );

  if (isPending) {
    return (
      <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
        {backLink}
        <p className="mt-8 text-muted" role="status">
          Loading…
        </p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
        {backLink}
        {error.status === 404 || error.status === 422 ? (
          <div className="mt-8">
            <h1 className="display text-4xl">Link not found</h1>
            <p className="mt-3 text-muted">It may have been deleted, or it belongs to a different account.</p>
          </div>
        ) : (
          <LoadError what="this link" onRetry={refetch} />
        )}
      </div>
    );
  }

  const { link, totals, timeseries, breakdowns } = data;

  function toggleActive() {
    updateLink.mutate(
      { id: link.id, isActive: !link.isActive },
      {
        onSuccess: () => toast(link.isActive ? "Link paused" : "Link resumed"),
        onError: (failure) => toast(failure.message, "error"),
      }
    );
  }

  function confirmDelete() {
    deleteLink.mutate(link.id, {
      onSuccess() {
        toast("Link deleted");
        navigate("/dashboard", { replace: true });
      },
      onError: (failure) => toast(failure.message, "error"),
    });
  }

  return (
    <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
      {backLink}

      <header className="mt-6">
        <div className="flex flex-wrap items-center gap-3">
          <h1 translate="no" className="break-all font-mono text-2xl font-medium sm:text-3xl">
            {withoutScheme(link.shortUrl)}
          </h1>
          <StatusBadge link={link} />
        </div>

        <p className="mt-3 flex items-start gap-2 text-muted">
          <span className="shrink-0">Goes to</span>
          <a href={link.originalUrl} target="_blank" rel="noreferrer" className="link min-w-0 break-all text-ink">
            {link.originalUrl}
            <ExternalLink aria-hidden="true" className="ml-1 inline size-3.5 align-baseline" />
          </a>
        </p>
        <p className="mt-1 text-sm text-muted">
          Created {formatDate(link.createdAt)}
          {link.expiresAt && `, expires ${formatDateTime(link.expiresAt)}`}
        </p>

        <div className="mt-5 flex flex-wrap gap-2.5">
          <CopyButton text={link.shortUrl} label="Copy link" className="btn btn-primary" />
          <QrButton link={link} />
          <button type="button" className="btn btn-secondary" onClick={() => setEditing(true)}>
            <Pencil aria-hidden="true" className="size-4" />
            Edit
          </button>
          <button type="button" className="btn btn-secondary" onClick={toggleActive} disabled={updateLink.isPending}>
            {link.isActive ? <Pause aria-hidden="true" className="size-4" /> : <Play aria-hidden="true" className="size-4" />}
            {link.isActive ? "Pause" : "Resume"}
          </button>
          <button type="button" className="btn btn-quiet hover:text-danger" onClick={() => setConfirmingDelete(true)}>
            <Trash2 aria-hidden="true" className="size-4" />
            Delete
          </button>
        </div>
      </header>

      <section aria-labelledby="clicks-heading" className="mt-12">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 id="clicks-heading" className="heading text-2xl">
            Clicks
          </h2>
          <RangePicker
            days={days}
            onChange={(value) => setParams(value === 30 ? {} : { days: String(value) }, { replace: true })}
          />
        </div>

        <div className={`transition-opacity duration-150 ${isPlaceholderData ? "opacity-50" : ""}`}>
          <div className="panel mt-5 p-5 sm:p-7">
            <dl className="grid grid-cols-2 gap-6 border-b border-line pb-6 sm:grid-cols-4">
              <Stat label={`Clicks, last ${days} days`} value={totals.clicksInRange} />
              <Stat label="Unique visitors" value={totals.uniqueVisitors} hint={`In the last ${days} days`} />
              <Stat label="Clicks, last 24 hours" value={totals.clicksLast24h} />
              <Stat label="Clicks, all time" value={totals.clicks} />
            </dl>
            <div className="mt-8">
              <ClicksChart data={timeseries} />
            </div>
          </div>

          <h2 className="heading mt-12 text-2xl">Where clicks came from</h2>
          <p className="mt-1 text-sm text-muted">
            In the last {days} days. Recent clicks can take a few seconds to appear.
          </p>
          <div className="panel mt-5 grid gap-x-10 gap-y-9 p-5 sm:grid-cols-2 sm:p-7 lg:grid-cols-3">
            <BreakdownList title="Referring sites" items={breakdowns.referrers} />
            <BreakdownList title="Devices" items={breakdowns.devices} />
            <BreakdownList title="Browsers" items={breakdowns.browsers} />
            <BreakdownList title="Operating systems" items={breakdowns.operatingSystems} />
            <BreakdownList
              title="Countries"
              items={breakdowns.countries.map((item) => ({ ...item, name: countryName(item.name) }))}
            />
          </div>
        </div>
      </section>

      {editing && <EditLinkDialog link={link} onClose={() => setEditing(false)} />}

      {confirmingDelete && (
        <ConfirmDialog
          title="Delete this link?"
          message={`${withoutScheme(link.shortUrl)} will stop working and its click history will be erased. This cannot be undone.`}
          confirmLabel="Delete link"
          busy={deleteLink.isPending}
          onConfirm={confirmDelete}
          onClose={() => setConfirmingDelete(false)}
        />
      )}
    </div>
  );
}

function EditLinkDialog({ link, onClose }) {
  const updateLink = useUpdateLink();
  const toast = useToast();
  const error = updateLink.error;

  function handleSubmit(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const expires = form.get("expiresAt");

    updateLink.mutate(
      {
        id: link.id,
        originalUrl: withScheme(form.get("originalUrl")),
        expiresAt: expires ? new Date(expires).toISOString() : null,
      },
      {
        onSuccess() {
          toast("Link saved");
          onClose();
        },
      }
    );
  }

  const urlError = error?.fieldError?.("originalUrl");
  const expiryError = error?.fieldError?.("expiresAt");
  const generalError = error && !urlError && !expiryError ? error.message : null;

  return (
    <Dialog title="Edit link" onClose={onClose}>
      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        {generalError && (
          <p role="alert" className="rounded-md bg-danger-wash px-4 py-3 text-sm font-medium text-danger">
            {generalError}
          </p>
        )}
        <div>
          <label htmlFor="edit-url" className="label">
            Goes to
          </label>
          <input
            id="edit-url"
            name="originalUrl"
            type="text"
            inputMode="url"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            required
            defaultValue={link.originalUrl}
            aria-invalid={urlError ? "true" : undefined}
            aria-describedby={urlError ? "edit-url-error" : undefined}
            className="input font-mono text-sm"
          />
          {urlError && (
            <p id="edit-url-error" className="field-error">
              {urlError}
            </p>
          )}
        </div>
        <div>
          <label htmlFor="edit-expires" className="label">
            Stops working on <span className="font-normal text-muted">(optional)</span>
          </label>
          <input
            id="edit-expires"
            name="expiresAt"
            type="datetime-local"
            autoComplete="off"
            defaultValue={toLocalInputValue(link.expiresAt)}
            aria-invalid={expiryError ? "true" : undefined}
            aria-describedby="edit-expires-help"
            className="input"
          />
          <p id="edit-expires-help" className={expiryError ? "field-error" : "mt-1.5 text-sm text-muted"}>
            {expiryError ?? "Clear the date to keep the link forever."}
          </p>
        </div>
        <div className="flex justify-end gap-3">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={updateLink.isPending}>
            {updateLink.isPending ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
