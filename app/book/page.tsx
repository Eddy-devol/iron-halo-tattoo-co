import BookingForm from "@/components/BookingForm";
import Link from "next/link";
import { resolveStudioContactDetails } from "@/lib/studio-contact";

export const metadata = { title: "Request a consultation" };
export const dynamic = "force-dynamic";

export default function BookPage() {
  const contact = resolveStudioContactDetails({
    email: process.env.STUDIO_CONTACT_EMAIL,
    phone: process.env.STUDIO_CONTACT_PHONE,
    facebookUrl: process.env.STUDIO_FACEBOOK_URL,
  });

  return (
    <main className="min-h-screen bg-ink px-5 py-6 text-bone sm:px-8 sm:py-8 lg:px-10">
      <header className="mx-auto flex max-w-7xl items-center justify-between gap-4 border-b border-white/10 pb-5">
        <Link href="/" className="font-display text-2xl tracking-tight">Iron Halo<span className="text-rust">.</span></Link>
        <Link href="/" className="nav-link text-[10px] uppercase tracking-[.18em] text-bone/60">← Back home</Link>
      </header>
      <div className="mx-auto grid max-w-7xl gap-10 py-14 sm:py-20 lg:grid-cols-[.8fr_1.2fr] lg:gap-16 lg:py-24">
        <div className="lg:sticky lg:top-12 lg:self-start">
          <p className="eyebrow">Start here</p>
          <h1 className="mt-5 font-display text-6xl leading-[.9] sm:text-7xl">Make an<br /><em className="text-rust">enquiry.</em></h1>
          <p className="mt-7 max-w-sm text-sm leading-7 text-bone/65">Tell us a little about your idea. Sending a request doesn’t book an appointment; we’ll follow up about next steps.</p>
        </div>
        <BookingForm contact={contact} />
      </div>
    </main>
  );
}
