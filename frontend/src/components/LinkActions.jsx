import { useState } from "react";
import { Check, Copy, Download, QrCode } from "lucide-react";
import { Dialog } from "./Dialog.jsx";
import { useToast } from "./Toast.jsx";

// Small controls that act on one short link: copy it, show its QR code, show its status.

export function CopyButton({ text, label = "Copy", className = "btn btn-secondary" }) {
  const [copied, setCopied] = useState(false);
  const toast = useToast();

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast("Link copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast("Could not copy. Select the link and copy it by hand.", "error");
    }
  }

  const Icon = copied ? Check : Copy;
  return (
    <button type="button" onClick={copy} className={className} aria-label={label === "" ? "Copy link" : undefined}>
      <Icon aria-hidden="true" className="size-4" />
      {label !== "" && (copied ? "Copied" : label)}
    </button>
  );
}

export function QrButton({ link, label = "QR code", className = "btn btn-secondary" }) {
  const [open, setOpen] = useState(false);
  const imageUrl = `/api/v1/qr/${link.shortCode}`;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={className}
        aria-label={label === "" ? "Show QR code" : undefined}
      >
        <QrCode aria-hidden="true" className="size-4" />
        {label}
      </button>

      {open && (
        <Dialog title="QR code" onClose={() => setOpen(false)}>
          <img
            src={imageUrl}
            alt={`QR code that opens ${link.shortUrl}`}
            width="256"
            height="256"
            className="mx-auto size-64 rounded border border-line"
          />
          <p translate="no" className="mt-4 break-all text-center font-mono text-sm">
            {link.shortUrl}
          </p>
          <div className="mt-5 flex justify-center gap-3">
            <a className="btn btn-secondary" href={`${imageUrl}?format=png`} download={`linkforge-${link.shortCode}.png`}>
              <Download aria-hidden="true" className="size-4" />
              PNG
            </a>
            <a className="btn btn-secondary" href={imageUrl} download={`linkforge-${link.shortCode}.svg`}>
              <Download aria-hidden="true" className="size-4" />
              SVG
            </a>
          </div>
        </Dialog>
      )}
    </>
  );
}

const STATUS_STYLES = {
  Active: "bg-good-wash text-good",
  Paused: "bg-warn-wash text-warn",
  Expired: "bg-danger-wash text-danger",
};

export function linkStatus(link) {
  if (link.expiresAt && new Date(link.expiresAt) <= new Date()) return "Expired";
  return link.isActive ? "Active" : "Paused";
}

export function StatusBadge({ link }) {
  const status = linkStatus(link);
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${STATUS_STYLES[status]}`}>
      {status}
    </span>
  );
}
