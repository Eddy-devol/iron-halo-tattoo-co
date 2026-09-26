import Link from "next/link";
import Image from "next/image";

const work = [
  { title: "Blackwork / étude no. 07", type: "Custom study", image: "https://images.unsplash.com/photo-1542727365-19732a80dcfd?auto=format&fit=crop&w=1100&q=85" },
  { title: "Botanical geometry", type: "Fine line", image: "https://images.unsplash.com/photo-1598373182133-52452f7691ef?auto=format&fit=crop&w=1100&q=85" },
  { title: "A quiet orbit", type: "Black & grey", image: "https://images.unsplash.com/photo-1565058379802-bbe93b2f703a?auto=format&fit=crop&w=1100&q=85" }
];

export default function Home() {
  return <main>
    <header className="absolute inset-x-0 top-0 z-10 border-b border-white/10">
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5 lg:px-10" aria-label="Main navigation">
        <Link href="/" className="font-display text-2xl tracking-tight text-bone">Iron Halo<span className="text-rust">.</span></Link>
        <div className="hidden items-center gap-8 text-[11px] uppercase tracking-[.22em] text-bone/70 md:flex">
          <a href="#work" className="transition hover:text-bone">The work</a><a href="#studio" className="transition hover:text-bone">The studio</a><a href="#process" className="transition hover:text-bone">Process</a>
        </div>
        <Link href="/book" className="button-quiet !px-4 !py-2.5 text-[10px]">Request a consult</Link>
      </nav>
    </header>

    <section className="relative flex min-h-[720px] items-end overflow-hidden bg-[#171614] px-6 pb-20 pt-32 lg:min-h-screen lg:px-10 lg:pb-28">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_20%,#5c3027_0%,transparent_38%),linear-gradient(110deg,#11110f_25%,transparent)]" />
      <div className="absolute right-[-12%] top-0 h-full w-[68%] bg-[url('https://images.unsplash.com/photo-1590246814883-57c76c59e1e7?auto=format&fit=crop&w=1600&q=85')] bg-cover bg-center opacity-60 mix-blend-screen grayscale" />
      <div className="relative mx-auto w-full max-w-7xl">
        <p className="eyebrow mb-6">Private studio / appointments only</p>
        <h1 className="max-w-3xl font-display text-7xl leading-[.85] tracking-[-.04em] text-bone sm:text-8xl lg:text-[10rem]">Mark<br /><em className="text-rust">with</em><br />meaning.</h1>
        <div className="mt-10 flex max-w-md flex-col gap-6 text-sm leading-6 text-bone/65 sm:flex-row sm:items-center"><p>Considered tattooing for people who want less noise and more intention.</p><Link href="/book" className="button-primary shrink-0">Start a conversation <span className="ml-2">↗</span></Link></div>
      </div>
    </section>

    <section id="studio" className="mx-auto grid max-w-7xl gap-14 px-6 py-24 lg:grid-cols-[1fr_1.2fr] lg:px-10 lg:py-36">
      <div><p className="eyebrow">01 — A considered practice</p><h2 className="mt-6 max-w-lg font-display text-5xl leading-[.95] sm:text-6xl">The slower<br /><em className="text-rust">way</em> in.</h2></div>
      <div className="max-w-xl text-lg leading-8 text-bone/65"><p>This is a placeholder studio statement: a quiet, focused space for original work, honest conversation, and tattoos made to live with you.</p><p className="mt-7 text-sm leading-6 text-bone/45">Details about location, artists, and availability can be added here when they are confirmed.</p></div>
    </section>

    <section id="work" className="border-y border-white/10 bg-[#151513] px-6 py-24 lg:px-10 lg:py-32">
      <div className="mx-auto max-w-7xl"><div className="flex items-end justify-between"><div><p className="eyebrow">02 — Selected work</p><h2 className="mt-5 font-display text-6xl">The archive</h2></div><span className="hidden text-xs uppercase tracking-[.2em] text-bone/40 sm:block">A small selection</span></div>
        <div className="mt-14 grid gap-8 md:grid-cols-3">{work.map((item) => <article key={item.title} className="group"><div className="aspect-[4/5] overflow-hidden bg-ink"><Image src={item.image} alt="" width={1100} height={1375} sizes="(max-width: 768px) 100vw, 33vw" className="h-full w-full object-cover grayscale transition duration-700 group-hover:scale-105 group-hover:grayscale-0" /></div><p className="mt-4 text-[10px] uppercase tracking-[.2em] text-rust">{item.type}</p><h3 className="mt-2 font-display text-3xl">{item.title}</h3></article>)}</div>
      </div>
    </section>

    <section id="process" className="mx-auto max-w-7xl px-6 py-24 lg:px-10 lg:py-36"><div className="grid gap-12 lg:grid-cols-[.8fr_1.2fr]"><div><p className="eyebrow">03 — The process</p><h2 className="mt-6 font-display text-6xl leading-[.9]">Good work<br /><em className="text-rust">takes time.</em></h2></div><ol className="divide-y divide-white/15 border-y border-white/15">{["Tell us what you’re carrying.", "Build the right shape together.", "Make space for the mark."].map((step, i) => <li key={step} className="flex items-center gap-8 py-7"><span className="font-display text-2xl text-rust">0{i + 1}</span><span className="font-display text-3xl">{step}</span></li>)}</ol></div></section>
    <footer className="border-t border-white/10 px-6 py-10 lg:px-10"><div className="mx-auto flex max-w-7xl flex-col justify-between gap-5 text-xs uppercase tracking-[.18em] text-bone/40 sm:flex-row"><span>© {new Date().getFullYear()} Iron Halo Tattoo Co.</span><span>Location + hours — to be confirmed</span><Link href="/admin" className="hover:text-bone">Studio login</Link></div></footer>
  </main>;
}
