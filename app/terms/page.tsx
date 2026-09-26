import Link from "next/link";

export const metadata = { title: "Terms" };

export default function TermsPage() {
  return <main className="min-h-screen bg-ink px-6 py-8 lg:px-10"><header className="mx-auto flex max-w-4xl items-center justify-between"><Link href="/" className="font-display text-2xl">Iron Halo<span className="text-rust">.</span></Link><Link href="/" className="text-[10px] uppercase tracking-[.2em] text-bone/50 hover:text-bone">← Back home</Link></header><article className="mx-auto max-w-3xl py-24"><p className="eyebrow">For review before launch</p><h1 className="mt-5 font-display text-7xl">Terms</h1><p className="mt-8 border-l border-rust pl-5 text-lg leading-8 text-bone/65">This placeholder is for final legal review before launch. Submitting a consultation request does not create an appointment or client relationship.</p><div className="mt-12 space-y-6 text-sm leading-8 text-bone/65"><p>Project details, timing, pricing, deposits, cancellations, and appointment availability are confirmed separately after review. Do not submit payment information through this website.</p><p>Replace this page with approved terms covering studio policies, consent, minors, deposits, cancellations, rescheduling, and intellectual property.</p></div></article></main>;
}
