import Image from "next/image";
import Link from "next/link";
import { listPublishedArchiveArtworks } from "@/lib/server/archive-public";
import { safeErrorCategory } from "@/lib/server/safe-error-category";
import { resolveStudioContactDetails } from "@/lib/studio-contact";

export const dynamic = "force-dynamic";

export default async function Home() {
  let work: Awaited<ReturnType<typeof listPublishedArchiveArtworks>> = [];
  let archiveUnavailable = false;

  try {
    work = await listPublishedArchiveArtworks();
  } catch (error) {
    archiveUnavailable = true;
    console.error("PUBLIC_ARCHIVE_RENDER_FAILED", { errorCategory: safeErrorCategory(error) });
  }

  const selectedWork = work.slice(0, 3);
  const heroArtwork = work[0];
  const contact = resolveStudioContactDetails({
    email: process.env.STUDIO_CONTACT_EMAIL,
    phone: process.env.STUDIO_CONTACT_PHONE,
    facebookUrl: process.env.STUDIO_FACEBOOK_URL,
  });

  return (
    <main>
      <section className="home-hero relative isolate flex min-h-[100svh] overflow-hidden bg-ink">
        <div className={`home-hero-media absolute inset-0 z-0 ${heroArtwork ? "" : "home-hero-media-fallback"}`}>
          {heroArtwork && (
            <Image
              src={`/api/archive/${encodeURIComponent(heroArtwork.slug)}/image`}
              alt=""
              aria-hidden="true"
              fill
              priority
              sizes="100vw"
              unoptimized
              className="home-hero-image object-cover"
            />
          )}
        </div>
        <div aria-hidden="true" className="home-hero-shade absolute inset-0 z-[1]" />

        <header className="absolute inset-x-0 top-0 z-20 border-b border-white/15">
          <nav className="mx-auto flex max-w-7xl flex-wrap items-center justify-between px-5 py-4 sm:px-8 lg:px-10" aria-label="Main navigation">
            <Link href="/" className="font-display leading-none tracking-tight text-bone" aria-label="Iron Halo Tattoo Co. home">
              <span className="block text-2xl sm:text-[1.7rem]">Iron Halo<span className="text-rust">.</span></span>
              <span className="mt-1 block font-sans text-[9px] uppercase tracking-[.24em] text-bone/60">Tattoo Co.</span>
            </Link>
            <Link href="/book" className="button-quiet !min-h-11 !px-4 !py-2.5 text-[10px] sm:!px-5">
              Start a booking <span className="link-arrow" aria-hidden="true">↗</span>
            </Link>
            <div className="order-3 flex w-full items-center justify-between gap-4 border-t border-white/10 pt-3 text-[9px] uppercase tracking-[.16em] text-bone/70 md:order-none md:w-auto md:justify-start md:gap-8 md:border-0 md:pt-0 md:text-[10px] md:tracking-[.2em]">
              <a href="#work" className="nav-link">The work</a>
              <a href="#studio" className="nav-link">The studio</a>
              <a href="#process" className="nav-link">The process</a>
            </div>
          </nav>
        </header>

        <div className="relative z-10 mx-auto flex min-h-[100svh] w-full max-w-7xl items-end px-5 pb-16 pt-36 sm:px-8 sm:pb-20 lg:px-10 lg:pb-24">
          <div className="home-hero-copy max-w-4xl">
            <p className="eyebrow mb-5 sm:mb-7">Private studio / appointments only</p>
            <h1 className="max-w-4xl font-display text-[clamp(4rem,12vw,10.5rem)] leading-[.76] tracking-[-.055em] text-bone">
              Mark with<br />
              <em className="font-normal text-rust">meaning.</em>
            </h1>
            <div className="mt-7 grid max-w-2xl gap-6 sm:mt-9 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end sm:gap-10">
              <p className="max-w-md text-sm leading-6 text-bone/75 sm:text-base sm:leading-7">
                Considered tattooing for people who want less noise and more intention.
              </p>
              <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
                <Link href="/book" className="button-primary w-full sm:w-auto">
                  Start a booking <span className="link-arrow" aria-hidden="true">↗</span>
                </Link>
                <a href="#work" className="button-quiet w-full sm:w-auto">
                  View the work
                </a>
              </div>
            </div>
          </div>
          <a href="#studio" className="home-scroll-indicator absolute bottom-8 right-8 hidden items-center gap-3 text-[9px] uppercase tracking-[.22em] text-bone/60 lg:flex" aria-label="Scroll to the studio introduction">
            <span>Scroll to explore</span>
            <span aria-hidden="true" className="h-10 w-px bg-bone/40" />
          </a>
        </div>
      </section>

      <section id="studio" className="section-space scroll-mt-8 border-b border-white/10 px-5 sm:px-8 lg:px-10">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[.7fr_1.3fr] lg:gap-20">
          <div>
            <p className="eyebrow">01 — The studio</p>
            <p className="mt-5 font-display text-2xl text-bone/55">Iron Halo<br />Tattoo Co.</p>
          </div>
          <div className="max-w-4xl">
            <h2 className="font-display text-5xl leading-[.93] tracking-[-.025em] sm:text-7xl lg:text-[5.5rem]">
              Every tattoo begins<br className="hidden sm:block" /> with <em className="font-normal text-rust">an idea.</em>
            </h2>
            <div className="mt-8 grid gap-6 border-t border-white/15 pt-6 text-sm leading-7 text-bone/65 sm:mt-10 sm:grid-cols-[1fr_.8fr] sm:gap-12">
              <p>Considered tattooing for people who want less noise and more intention.</p>
              <p>Share a little about your idea. A booking request is not a confirmed appointment; the studio will reply with next steps.</p>
            </div>
          </div>
        </div>
      </section>

      <section id="work" className="section-space scroll-mt-8 border-b border-white/10 bg-graphite/60 px-5 sm:px-8 lg:px-10">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col gap-5 border-b border-white/15 pb-7 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="eyebrow">02 — Completed tattoo work</p>
              <h2 className="mt-4 font-display text-5xl leading-none sm:text-7xl">Selected work</h2>
            </div>
            <p className="max-w-xs text-xs leading-5 text-bone/50 sm:text-right">A selection from the Iron Halo studio archive.</p>
          </div>

          {selectedWork.length > 0 ? (
            <div className="mt-8 grid gap-x-8 gap-y-12 md:grid-cols-12 md:items-start md:gap-y-16 lg:mt-12">
              {selectedWork.map((item, index) => (
                <article
                  key={item.slug}
                  className={`group min-w-0 ${index === 0 ? "md:col-span-7" : "md:col-span-5"} ${index === 1 ? "md:mt-20" : ""}`}
                >
                  <div className={`image-frame ${index === 0 ? "aspect-[4/5] md:aspect-[5/4]" : "aspect-[4/5]"}`}>
                    <Image
                      src={`/api/archive/${encodeURIComponent(item.slug)}/image`}
                      alt={item.altText}
                      fill
                      sizes={index === 0 ? "(max-width: 768px) 100vw, 58vw" : "(max-width: 768px) 100vw, 42vw"}
                      unoptimized
                      className="artwork-image object-cover group-hover:scale-[1.025]"
                    />
                  </div>
                  <div className="mt-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2 border-b border-white/15 pb-4">
                    <div>
                      {item.style && <p className="eyebrow !text-[9px]">{item.style}</p>}
                      <h3 className="mt-1 font-display text-3xl sm:text-4xl">{item.title}</h3>
                    </div>
                    <span className="text-[10px] uppercase tracking-[.18em] text-bone/45">0{index + 1}</span>
                  </div>
                  {item.description && <p className="mt-3 max-w-lg text-sm leading-6 text-bone/55">{item.description}</p>}
                </article>
              ))}
            </div>
          ) : (
            <p className="mt-8 max-w-lg border-l border-rust/70 py-2 pl-5 text-sm leading-7 text-bone/60">
              {archiveUnavailable
                ? "The studio archive is temporarily unavailable. Please check back soon."
                : "Selected work will appear here as it is added to the studio archive."}
            </p>
          )}

          <div className="mt-10 border-t border-white/15 pt-6 sm:mt-14 sm:flex sm:items-center sm:justify-between">
            <p className="text-xs uppercase tracking-[.16em] text-bone/45">Iron Halo / Studio archive</p>
            <a href="#work" className="nav-link mt-4 inline-flex min-h-11 items-center gap-2 text-xs uppercase tracking-[.16em] text-bone sm:mt-0">
              View the work <span className="link-arrow" aria-hidden="true">↗</span>
            </a>
          </div>
        </div>
      </section>

      <section id="process" className="section-space scroll-mt-8 px-5 sm:px-8 lg:px-10">
        <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[.8fr_1.2fr] lg:gap-20">
          <div>
            <p className="eyebrow">03 — The process</p>
            <h2 className="mt-5 max-w-lg font-display text-5xl leading-[.92] sm:text-7xl">
              An idea,<br />made <em className="font-normal text-rust">intentional.</em>
            </h2>
            <p className="mt-6 max-w-md text-sm leading-7 text-bone/60">
              Share a little about your idea. The request is reviewed before any appointment is confirmed.
            </p>
          </div>
          <ol className="border-y border-white/15">
            {["Booking request", "Artist review", "Approval / follow-up", "Scheduling"].map((step, index) => (
              <li key={step} className="home-process-row flex min-h-20 items-center gap-5 border-b border-white/10 py-5 last:border-b-0 sm:gap-8 sm:py-6">
                <span className="home-process-number w-8 shrink-0 font-display text-2xl text-rust sm:w-10 sm:text-3xl">0{index + 1}</span>
                <h3 className="font-display text-2xl text-bone/90 sm:text-3xl">{step}</h3>
                <span aria-hidden="true" className="ml-auto text-bone/30">↗</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="border-y border-ink/10 bg-bone px-5 py-16 text-ink sm:px-8 sm:py-24 lg:px-10 lg:py-32">
        <div className="mx-auto grid max-w-7xl gap-8 sm:grid-cols-[1fr_auto] sm:items-end sm:gap-12">
          <div>
            <p className="eyebrow">Ready to begin?</p>
            <h2 className="mt-5 max-w-3xl font-display text-5xl leading-[.92] tracking-[-.025em] sm:text-7xl lg:text-[6rem]">
              Your idea starts here.
            </h2>
            <p className="mt-6 max-w-xl text-sm leading-7 text-ink/65">
              Send a booking request to begin the conversation. An enquiry is not a confirmed appointment.
            </p>
          </div>
          <Link href="/book" className="inline-flex min-h-12 items-center justify-center gap-3 border border-ink/30 px-5 py-3 text-xs font-bold uppercase tracking-[.16em] transition-colors hover:border-ink hover:bg-ink/[.04] focus-visible:outline focus-visible:outline-2 focus-visible:outline-rust focus-visible:outline-offset-4">
            Start a booking <span className="link-arrow" aria-hidden="true">↗</span>
          </Link>
        </div>
      </section>

      <footer className="px-5 py-10 sm:px-8 sm:py-12 lg:px-10">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-10 border-b border-white/10 pb-8 sm:grid-cols-[1fr_auto] sm:items-start">
            <div>
              <Link href="/" className="inline-block font-display text-3xl tracking-tight text-bone">
                Iron Halo<span className="text-rust">.</span>
              </Link>
              <p className="mt-2 text-[9px] uppercase tracking-[.24em] text-bone/50">Tattoo Co.</p>
            </div>
            <nav className="grid grid-cols-2 gap-x-8 gap-y-3 text-[10px] uppercase tracking-[.15em] text-bone/65 sm:grid-cols-3 sm:gap-x-10" aria-label="Footer navigation">
              <a className="nav-link" href="#work">The work</a>
              <a className="nav-link" href="#studio">The studio</a>
              <Link className="nav-link" href="/book">Booking</Link>
              <Link className="nav-link" href="/privacy">Privacy</Link>
              <Link className="nav-link" href="/terms">Terms</Link>
              <Link className="nav-link" href="/admin">Studio login</Link>
            </nav>
          </div>
          <div className="flex flex-col gap-5 pt-6 text-[10px] uppercase tracking-[.14em] text-bone/45 sm:flex-row sm:items-center sm:justify-between">
            <span>© {new Date().getFullYear()} Iron Halo Tattoo Co.</span>
            <div className="flex flex-wrap gap-x-6 gap-y-3">
              {contact.email && <a className="hover:text-bone focus-visible:text-bone" href={contact.email.href}>Email</a>}
              {contact.phone && <a className="hover:text-bone focus-visible:text-bone" href={contact.phone.href}>Phone</a>}
              {contact.facebook && <a className="hover:text-bone focus-visible:text-bone" href={contact.facebook.href} target="_blank" rel="noopener noreferrer">Facebook / Messenger</a>}
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}
