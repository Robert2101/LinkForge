// Shown in place of content that failed to load, with a way to try again.
export function LoadError({ what, onRetry }) {
  return (
    <div className="panel mt-5 px-6 py-10 text-center" role="alert">
      <p className="heading text-lg">Could not load {what}</p>
      <p className="mt-1 text-muted">Check your connection, then try again.</p>
      <button type="button" className="btn btn-secondary mt-4" onClick={() => onRetry()}>
        Try again
      </button>
    </div>
  );
}
