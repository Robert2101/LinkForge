import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { ChevronLeft, ChevronRight, Pause, Play, Search, Trash2 } from "lucide-react";
import { ClicksChart, RangePicker, Stat } from "../components/ClicksChart.jsx";
import { ConfirmDialog } from "../components/Dialog.jsx";
import { ForgedLink } from "../components/ForgedLink.jsx";
import { CopyButton, QrButton, StatusBadge } from "../components/LinkActions.jsx";
import { LoadError } from "../components/LoadError.jsx";
import { ShortenForm } from "../components/ShortenForm.jsx";
import { useToast } from "../components/Toast.jsx";
import { formatCount, formatDate, withoutScheme } from "../lib/format.js";
import { useDeleteLink, useLinks, useOverview, useUpdateLink } from "../lib/queries.js";

const RANGES = [7, 30, 90];

export default function Dashboard() {
  // Range, search and page live in the URL, so a reload or a shared link
  // shows the same view:  /dashboard?days=7&q=sale&page=2
  const [params, setParams] = useSearchParams();
  const days = RANGES.includes(Number(params.get("days"))) ? Number(params.get("days")) : 30;
  const search = params.get("q") ?? "";
  const page = Math.max(1, Number(params.get("page")) || 1);

  function updateParams(changes) {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        for (const [key, value] of Object.entries(changes)) {
          if (value === "" || value === null) next.delete(key);
          else next.set(key, String(value));
        }
        return next;
      },
      { replace: true }
    );
  }

  const [newLink, setNewLink] = useState(null);
  const toast = useToast();

  return (
    <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
      <h1 className="display text-4xl sm:text-5xl">Your links</h1>

      <section aria-label="Create a link" className="mt-8 max-w-3xl">
        <ShortenForm
          onCreated={(link) => {
            setNewLink(link);
            toast("Link shortened");
          }}
        />
        {newLink && (
          <div className="mt-6">
            <ForgedLink key={newLink.id} link={newLink} />
          </div>
        )}
      </section>

      <Overview days={days} onDaysChange={(value) => updateParams({ days: value === 30 ? null : value })} />

      <LinksTable
        search={search}
        page={page}
        onSearch={(value) => updateParams({ q: value, page: null })}
        onPage={(value) => updateParams({ page: value === 1 ? null : value })}
      />
    </div>
  );
}

function Overview({ days, onDaysChange }) {
  const { data, isPending, isError, isPlaceholderData, refetch } = useOverview(days);

  return (
    <section aria-labelledby="overview-heading" className="mt-14">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 id="overview-heading" className="heading text-2xl">
          Clicks
        </h2>
        <RangePicker days={days} onChange={onDaysChange} />
      </div>

      {isPending ? (
        <p className="mt-6 text-muted" role="status">
          Loading…
        </p>
      ) : isError ? (
        <LoadError what="your numbers" onRetry={refetch} />
      ) : (
        <div className="panel mt-5 p-5 sm:p-7">
          <dl className="grid grid-cols-2 gap-6 border-b border-line pb-6 sm:grid-cols-4">
            <Stat label={`Clicks, last ${days} days`} value={data.totals.clicksInRange} />
            <Stat label="Clicks, all time" value={data.totals.clicks} />
            <Stat label="Links" value={data.totals.links} />
            <Stat label="Active links" value={data.totals.activeLinks} />
          </dl>
          <div className="mt-8">
            <ClicksChart data={data.timeseries} dimmed={isPlaceholderData} />
          </div>
        </div>
      )}
    </section>
  );
}

function LinksTable({ search, page, onSearch, onPage }) {
  const { data, isPending, isError, isPlaceholderData, refetch } = useLinks({ page, search });
  const updateLink = useUpdateLink();
  const deleteLink = useDeleteLink();
  const [linkToDelete, setLinkToDelete] = useState(null);
  const toast = useToast();

  function toggleActive(link) {
    updateLink.mutate(
      { id: link.id, isActive: !link.isActive },
      {
        onSuccess: () => toast(link.isActive ? "Link paused" : "Link resumed"),
        onError: (error) => toast(error.message, "error"),
      }
    );
  }

  function confirmDelete() {
    deleteLink.mutate(linkToDelete.id, {
      onSuccess() {
        toast("Link deleted");
        setLinkToDelete(null);
      },
      onError: (error) => toast(error.message, "error"),
    });
  }

  const items = data?.items ?? [];
  const pagination = data?.pagination;

  return (
    <section aria-labelledby="links-heading" className="mt-14">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 id="links-heading" className="heading text-2xl">
          All links
          {pagination && <span className="ml-2 text-base font-normal text-muted">{formatCount(pagination.total)}</span>}
        </h2>

        <form
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            onSearch(new FormData(event.currentTarget).get("q").trim());
          }}
          className="relative w-full sm:w-72"
        >
          <label htmlFor="link-search" className="sr-only">
            Search links
          </label>
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input
            id="link-search"
            key={search}
            name="q"
            type="search"
            defaultValue={search}
            autoComplete="off"
            placeholder="Search by name or URL…"
            className="input pl-9"
          />
        </form>
      </div>

      {isPending ? (
        <p className="mt-6 text-muted" role="status">
          Loading…
        </p>
      ) : isError ? (
        <LoadError what="your links" onRetry={refetch} />
      ) : items.length === 0 ? (
        <div className="panel mt-5 px-6 py-12 text-center">
          {search ? (
            <>
              <p className="heading text-lg">No links match “{search}”</p>
              <button type="button" className="btn btn-secondary mt-4" onClick={() => onSearch("")}>
                Clear search
              </button>
            </>
          ) : (
            <>
              <p className="heading text-lg">No links yet</p>
              <p className="mt-1 text-muted">Paste a URL in the box at the top of this page to make your first one.</p>
            </>
          )}
        </div>
      ) : (
        <div className={`panel mt-5 transition-opacity duration-150 ${isPlaceholderData ? "opacity-50" : ""}`}>
          <ul className="divide-y divide-line">
            {items.map((link) => (
              <li key={link.id} className="flex flex-col gap-3 px-4 py-4 sm:px-5 lg:flex-row lg:items-center lg:gap-6">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2.5">
                    <Link
                      to={`/links/${link.id}`}
                      translate="no"
                      className="min-w-0 truncate font-mono font-medium hover:underline"
                    >
                      {withoutScheme(link.shortUrl)}
                    </Link>
                    <StatusBadge link={link} />
                  </div>
                  <p className="mt-1 truncate text-sm text-muted" title={link.originalUrl}>
                    {withoutScheme(link.originalUrl)}
                  </p>
                </div>

                <div className="flex items-center justify-between gap-4 lg:justify-end">
                  <div className="flex items-baseline gap-4 text-sm text-muted">
                    <span>
                      <span className="font-semibold tabular-nums text-ink">{formatCount(link.clickCount)}</span>{" "}
                      {link.clickCount === 1 ? "click" : "clicks"}
                    </span>
                    <span className="hidden sm:inline">Created {formatDate(link.createdAt)}</span>
                  </div>

                  <div className="flex items-center">
                    <CopyButton text={link.shortUrl} label="" className="btn btn-quiet" />
                    <QrButton link={link} label="" className="btn btn-quiet" />
                    <button
                      type="button"
                      className="btn btn-quiet"
                      onClick={() => toggleActive(link)}
                      disabled={updateLink.isPending}
                      aria-label={link.isActive ? "Pause link" : "Resume link"}
                    >
                      {link.isActive ? (
                        <Pause aria-hidden="true" className="size-4" />
                      ) : (
                        <Play aria-hidden="true" className="size-4" />
                      )}
                    </button>
                    <button
                      type="button"
                      className="btn btn-quiet hover:text-danger"
                      onClick={() => setLinkToDelete(link)}
                      aria-label="Delete link"
                    >
                      <Trash2 aria-hidden="true" className="size-4" />
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          {pagination.totalPages > 1 && (
            <nav aria-label="Pages" className="flex items-center justify-between border-t border-line px-4 py-3 sm:px-5">
              <button type="button" className="btn btn-quiet" disabled={page <= 1} onClick={() => onPage(page - 1)}>
                <ChevronLeft aria-hidden="true" className="size-4" />
                Previous
              </button>
              <span className="text-sm tabular-nums text-muted">
                Page {pagination.page} of {pagination.totalPages}
              </span>
              <button
                type="button"
                className="btn btn-quiet"
                disabled={page >= pagination.totalPages}
                onClick={() => onPage(page + 1)}
              >
                Next
                <ChevronRight aria-hidden="true" className="size-4" />
              </button>
            </nav>
          )}
        </div>
      )}

      {linkToDelete && (
        <ConfirmDialog
          title="Delete this link?"
          message={`${withoutScheme(linkToDelete.shortUrl)} will stop working and its click history will be erased. This cannot be undone.`}
          confirmLabel="Delete link"
          busy={deleteLink.isPending}
          onConfirm={confirmDelete}
          onClose={() => setLinkToDelete(null)}
        />
      )}
    </section>
  );
}
