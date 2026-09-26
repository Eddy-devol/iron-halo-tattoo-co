import Link from "next/link";

export const metadata = { title: "Privacy" };

export default function PrivacyPage() {
  return <LegalPage title="Privacy" intro="This placeholder is for final legal review before launch. It describes the intended handling of consultation requests, but is not legal advice.">
    <p>Iron Halo Tattoo Co. will use information submitted through the booking form to review a tattoo project and respond about next steps. Client information and reference images are intended to remain private.</p>
    <p>Before launch, replace this page with an approved privacy notice covering retention, storage providers, email communications, rights requests, and any analytics.</p>
  </LegalPage>;
}

function LegalPage({ title, intro, children }: { title: string; intro: string; children: React.ReactNode }) {
  return <main className="min-h-screen bg-ink px-6 py-8 lg:px-10"><header className="mx-auto flex max-w-4xl items-center justify-between"><Link href="/" className="font-display text-2xl">Iron Halo<span className="text-rust">.</span></Link><Link href="/" className="text-[10px] uppercase tracking-[.2em] text-bone/50 hover:text-bone">← Back home</Link></header><article className="mx-auto max-w-3xl py-24"><p className="eyebrow">For review before launch</p><h1 className="mt-5 font-display text-7xl">{title}</h1><p className="mt-8 border-l border-rust pl-5 text-lg leading-8 text-bone/65">{intro}</p><div className="mt-12 space-y-6 text-sm leading-8 text-bone/65">{children}</div></article></main>;
}
