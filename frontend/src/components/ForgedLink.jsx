import { ExternalLink } from "lucide-react";
import { withoutScheme } from "../lib/format.js";
import { CopyButton, QrButton } from "./LinkActions.jsx";

// Shows a short link that was just made, with the long URL it replaced.
// `key` it by link id so the strike animation replays for every new link.
export function ForgedLink({ link }) {
  const saved = link.originalUrl.length - link.shortUrl.length;

  return (
    <div className="panel relative overflow-hidden p-5 sm:p-6" role="status">
      {/* The glowing edge that cools down after the strike. */}
      <span aria-hidden="true" className="struck-heat absolute inset-x-0 top-0 h-1 bg-ember-hot" />

      <p className="truncate font-mono text-sm text-muted line-through decoration-line-strong" title={link.originalUrl}>
        {withoutScheme(link.originalUrl)}
      </p>

      <a
        href={link.shortUrl}
        target="_blank"
        rel="noreferrer"
        translate="no"
        className="struck mt-2 block break-all font-mono text-2xl font-medium text-ember-dark hover:underline sm:text-3xl"
      >
        {withoutScheme(link.shortUrl)}
      </a>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <CopyButton text={link.shortUrl} label="Copy link" className="btn btn-primary" />
        <QrButton link={link} />
        <a href={link.shortUrl} target="_blank" rel="noreferrer" className="btn btn-quiet">
          <ExternalLink aria-hidden="true" className="size-4" />
          Open
        </a>
        {saved > 0 && (
          <span className="text-sm text-muted sm:ml-auto">
            {saved} characters shorter
          </span>
        )}
      </div>
    </div>
  );
}
