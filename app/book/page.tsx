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

  return <main className="min-h-screen bg-ink px-6 py-8 lg:px-10"><header className="mx-auto flex max-w-7xl items-center justify-between"><Link href="/" className="font-display text-2xl">Iron Halo<span className="text-rust">.</span></Link><Link href="/" className="text-[10px] uppercase tracking-[.2em] text-bone/50 hover:text-bone">← Back home</Link></header><div className="mx-auto grid max-w-7xl gap-14 py-20 lg:grid-cols-[.8fr_1.2fr] lg:py-28"><div><p className="eyebrow">Start here</p><h1 className="mt-6 font-display text-7xl leading-[.85]">Make an<br /><em className="text-rust">enquiry.</em></h1><p className="mt-8 max-w-sm text-sm leading-7 text-bone/60">Share a little about your idea. This form is a request, not a confirmed appointment. We’ll reply with next steps.</p></div><BookingForm contact={contact} /></div></main>;
}
