"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

export default function AdminHeader() {
  const [error, setError] = useState("");
  const pathname = usePathname();

  async function logout() {
    setError("");
    try {
      const response = await fetch("/api/admin/logout", { method: "POST" });
      if (!response.ok) throw new Error("Sign out failed.");
      window.location.href = "/admin/login";
    } catch {
      setError("Unable to sign out. Please try again.");
    }
  }

  return (
    <header className="border-b border-ink/10 bg-[#f1ede5]/95 px-4 py-4 sm:px-6 sm:py-5">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-5 gap-y-3">
        <Link href="/admin" className="font-display text-2xl">
          Iron Halo<span className="text-rust">.</span>
        </Link>
        <nav className="order-3 flex w-full items-center gap-5 border-t border-ink/10 pt-3 sm:order-none sm:w-auto sm:border-0 sm:pt-0 sm:gap-6" aria-label="Studio administration">
          <Link
            href="/admin"
            aria-current={pathname === "/admin" || pathname.startsWith("/admin/bookings") ? "page" : undefined}
            className={`nav-link text-[10px] uppercase tracking-[.14em] ${pathname === "/admin" || pathname.startsWith("/admin/bookings") ? "border-current text-ink" : "text-ink/60"}`}
          >
            Bookings
          </Link>
          <Link
            href="/admin/archive"
            aria-current={pathname.startsWith("/admin/archive") ? "page" : undefined}
            className={`nav-link text-[10px] uppercase tracking-[.14em] ${pathname.startsWith("/admin/archive") ? "border-current text-ink" : "text-ink/60"}`}
          >
            Archive
          </Link>
        </nav>
        <div className="ml-auto flex items-center gap-3 sm:gap-5">
          {error && <span className="max-w-36 text-xs text-rust" role="alert">{error}</span>}
          <span className="hidden text-[10px] uppercase tracking-[.16em] text-ink/50 lg:inline">Studio console</span>
          <button type="button" onClick={logout} className="button-quiet min-h-10 px-3 py-2 text-[9px] text-ink/70 sm:px-4">
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
