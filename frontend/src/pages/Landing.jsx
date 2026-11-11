import { useState } from "react";
import { Link } from "react-router";
import { useAuth } from "../auth/AuthContext.jsx";
import { ForgedLink } from "../components/ForgedLink.jsx";
import { ShortenForm } from "../components/ShortenForm.jsx";

const FEATURES = [
  {
    name: "Click analytics",
    detail: "Clicks per day, unique visitors, and where they came from: device, browser, country and referring site.",
  },
  {
    name: "Names you choose",
    detail: "Use your own word after the slash, like /spring-sale, in place of a random code.",
  },
  {
    name: "Pause, edit, expire",
    detail: "Point a link somewhere new, switch it off for a while, or set a date after which it stops working.",
  },
  {
    name: "QR codes",
    detail: "Every link comes with a QR code you can download as PNG or SVG for print.",
  },
];

// What the server does between a click and the redirect. This is a real
// sequence, so it is numbered.
const CLICK_STEPS = [
  {
    title: "Look the code up in Redis",
    detail: "Popular links are answered from memory. Postgres is only asked when a link is not cached yet.",
  },
  {
    title: "Redirect straight away",
    detail: "The visitor gets a 302 to the long URL. Nothing on this path waits for a database write.",
  },
  {
    title: "Record the click afterwards",
    detail: "Clicks are collected in memory and written to Postgres in batches every two seconds.",
  },
];

export default function Landing() {
  const { user } = useAuth();
  const [link, setLink] = useState(null);

  return (
    <>
      <section className="mx-auto max-w-6xl px-5 pb-16 pt-14 sm:px-8 sm:pb-24 sm:pt-20">
        <h1 className="display max-w-4xl text-[clamp(2.5rem,7vw,5.25rem)]">Hammer long links into short ones.</h1>
        <p className="mt-6 max-w-xl text-lg text-muted">
          Paste a URL and get a short link you can share anywhere. Create an account to see who clicks it.
        </p>

        <div className="mt-10 max-w-3xl">
          <ShortenForm onCreated={setLink} />
        </div>

        {link && (
          <div className="mt-8 max-w-3xl">
            <ForgedLink key={link.id} link={link} />
            {!user && (
              <p className="mt-4 text-sm text-muted">
                This link works right away, but it is not saved to an account.{" "}
                <Link to="/register" className="link text-ink">
                  Create an account
                </Link>{" "}
                to track clicks and edit links later.
              </p>
            )}
          </div>
        )}
      </section>

      <section aria-labelledby="features-heading" className="border-t border-line bg-surface">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-16 sm:px-8 lg:grid-cols-[1fr_2fr] lg:py-20">
          <h2 id="features-heading" className="heading text-3xl">
            What you get with an account
          </h2>
          <dl className="grid gap-x-10 sm:grid-cols-2">
            {FEATURES.map((feature) => (
              <div key={feature.name} className="border-t border-line py-5">
                <dt className="heading text-lg">{feature.name}</dt>
                <dd className="mt-1.5 text-muted">{feature.detail}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section aria-labelledby="click-heading" className="border-t border-line">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-16 sm:px-8 lg:grid-cols-[1fr_2fr] lg:py-20">
          <div>
            <h2 id="click-heading" className="heading text-3xl">
              What happens when someone clicks
            </h2>
            <p className="mt-3 text-muted">The visitor is redirected first. The record keeping happens afterwards.</p>
          </div>
          <ol className="grid gap-8 sm:grid-cols-3">
            {CLICK_STEPS.map((step, index) => (
              <li key={step.title} className="border-t-2 border-ink pt-4">
                <span className="font-mono text-sm text-muted">{index + 1}</span>
                <h3 className="heading mt-1 text-lg">{step.title}</h3>
                <p className="mt-1.5 text-muted">{step.detail}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>
    </>
  );
}
