import { useState } from "react";
import { axisTicks, formatCount, formatDay } from "../lib/format.js";

// Clicks per day as a column chart, drawn with plain HTML and CSS (no chart
// library): each day is a flex column whose height is a percentage.
//
// Reading it without a mouse: focus the chart and use the arrow keys to move
// from day to day, or open "View as table" underneath.
export function ClicksChart({ data, dimmed = false }) {
  const [activeIndex, setActiveIndex] = useState(null);

  const total = data.reduce((sum, day) => sum + day.clicks, 0);
  const ticks = axisTicks(Math.max(...data.map((day) => day.clicks)));
  const top = ticks.at(-1);
  const active = activeIndex === null ? null : data[activeIndex];

  // About six date labels along the bottom, however many days are shown.
  const labelEvery = Math.ceil(data.length / 6);

  function handleKeyDown(event) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const step = event.key === "ArrowRight" ? 1 : -1;
    setActiveIndex((index) => Math.min(data.length - 1, Math.max(0, (index ?? data.length) + step)));
  }

  return (
    <figure className={`transition-opacity duration-150 ${dimmed ? "opacity-50" : ""}`}>
      <div
        role="img"
        tabIndex={0}
        aria-label={`Clicks per day for the last ${data.length} days. ${formatCount(total)} clicks in total. Use the left and right arrow keys to read each day.`}
        onKeyDown={handleKeyDown}
        onBlur={() => setActiveIndex(null)}
        onPointerLeave={() => setActiveIndex(null)}
        className="relative grid grid-cols-[auto_1fr] gap-x-3 rounded"
      >
        {/* Y axis: round numbers, highest at the top. */}
        <div aria-hidden="true" className="flex h-56 flex-col-reverse justify-between text-right text-xs tabular-nums text-muted">
          {ticks.map((tick) => (
            <span key={tick} className="-my-2 leading-4">
              {formatCount(tick)}
            </span>
          ))}
        </div>

        <div className="relative h-56">
          {/* Gridlines sit behind the columns. */}
          <div aria-hidden="true" className="absolute inset-0 flex flex-col-reverse justify-between">
            {ticks.map((tick) => (
              <span key={tick} className={`h-px ${tick === 0 ? "bg-line-strong" : "bg-line"}`} />
            ))}
          </div>

          <div aria-hidden="true" className="absolute inset-0 flex items-end">
            {data.map((day, index) => (
              // The whole slot is the hover target, not just the painted column.
              <div
                key={day.date}
                onPointerEnter={() => setActiveIndex(index)}
                className="flex h-full min-w-0 flex-1 items-end justify-center px-px"
              >
                <div
                  style={{ height: `${(day.clicks / top) * 100}%` }}
                  className={`w-full max-w-6 rounded-t ${day.clicks > 0 ? "min-h-0.5" : ""} ${
                    index === activeIndex ? "bg-ink" : "bg-data"
                  }`}
                />
              </div>
            ))}
          </div>

          {active && (
            <div
              aria-hidden="true"
              style={{ left: `clamp(3rem, ${((activeIndex + 0.5) / data.length) * 100}%, calc(100% - 3rem))` }}
              className="pointer-events-none absolute top-1 z-10 -translate-x-1/2 whitespace-nowrap rounded bg-ink px-2.5 py-1.5 text-center text-white shadow-lg"
            >
              <div className="text-sm font-semibold tabular-nums">
                {formatCount(active.clicks)} {active.clicks === 1 ? "click" : "clicks"}
              </div>
              <div className="text-xs text-white/75">{formatDay(active.date)}</div>
            </div>
          )}
        </div>

        {/* X axis: a few dates, counted from the right so today is always labelled. */}
        <div />
        <div aria-hidden="true" className="relative mt-2 h-4 text-xs text-muted">
          {data.map((day, index) => {
            const fromRight = data.length - 1 - index;
            if (fromRight % labelEvery !== 0) return null;
            const isLast = fromRight === 0;
            // On narrow screens every second label is hidden so they do not collide.
            const hideOnMobile = (fromRight / labelEvery) % 2 === 1;
            return (
              <span
                key={day.date}
                style={isLast ? { right: 0 } : { left: `${((index + 0.5) / data.length) * 100}%` }}
                className={`absolute whitespace-nowrap ${isLast ? "" : "-translate-x-1/2"} ${
                  hideOnMobile ? "hidden sm:inline" : ""
                }`}
              >
                {formatDay(day.date)}
              </span>
            );
          })}
        </div>

        {/* Announces the day reached with the arrow keys. */}
        <span className="sr-only" aria-live="polite">
          {active ? `${formatDay(active.date)}: ${active.clicks} clicks` : ""}
        </span>
      </div>

      {total === 0 && (
        <p className="mt-4 text-sm text-muted">No clicks in this period yet. Share a link to see activity here.</p>
      )}

      <details className="mt-4 text-sm">
        <summary className="cursor-pointer text-muted hover:text-ink">View as table</summary>
        <div className="mt-3 max-h-64 overflow-y-auto rounded border border-line">
          <table className="w-full text-left">
            <thead className="sticky top-0 bg-paper text-muted">
              <tr>
                <th scope="col" className="px-3 py-2 font-semibold">Day (UTC)</th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">Clicks</th>
              </tr>
            </thead>
            <tbody>
              {data.toReversed().map((day) => (
                <tr key={day.date} className="border-t border-line">
                  <td className="px-3 py-1.5">{formatDay(day.date)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{formatCount(day.clicks)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

// "Last 7 / 30 / 90 days" switch. The choice lives in the URL (?days=30).
const RANGES = [7, 30, 90];

export function RangePicker({ days, onChange }) {
  return (
    <div role="group" aria-label="Time range" className="inline-flex rounded-md border border-line-strong bg-surface p-0.5">
      {RANGES.map((range) => (
        <button
          key={range}
          type="button"
          onClick={() => onChange(range)}
          aria-pressed={days === range}
          className={`rounded px-3 py-1.5 text-sm font-semibold transition-colors duration-100 ${
            days === range ? "bg-ink text-white" : "text-muted hover:text-ink"
          }`}
        >
          {range} days
        </button>
      ))}
    </div>
  );
}

// A headline number with its label, e.g. "1,284 / Total clicks".
export function Stat({ label, value, hint }) {
  return (
    <div>
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="heading mt-1 text-3xl tabular-nums">{formatCount(value)}</dd>
      {hint && <dd className="mt-0.5 text-xs text-muted">{hint}</dd>}
    </div>
  );
}

// One breakdown ("Browsers"): each row is a name, a count, and a bar showing its share.
export function BreakdownList({ title, items }) {
  const largest = Math.max(1, ...items.map((item) => item.clicks));

  return (
    <section>
      <h3 className="heading text-base">{title}</h3>
      {items.length === 0 ? (
        <p className="mt-3 text-sm text-muted">No clicks yet.</p>
      ) : (
        <ul className="mt-3 space-y-2.5">
          {items.map((item) => (
            <li key={item.name}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 truncate" title={item.name}>
                  {item.name}
                </span>
                <span className="font-semibold tabular-nums">{formatCount(item.clicks)}</span>
              </div>
              <div aria-hidden="true" className="mt-1 h-1.5 rounded-full bg-data-wash">
                <div className="h-full rounded-full bg-data" style={{ width: `${(item.clicks / largest) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
