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
    <header className="border-b border-ink/15 px-6 py-5">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
        <Link href="/admin" className="font-display text-2xl">
          Iron Halo<span className="text-rust">.</span>
        </Link>
        <nav className="flex items-center gap-4 sm:gap-6" aria-label="Studio administration">
          <Link
            href="/admin"
            aria-current={pathname === "/admin" || pathname.startsWith("/admin/bookings") ? "page" : undefined}
            className={`text-[10px] uppercase tracking-[.16em] ${pathname === "/admin" || pathname.startsWith("/admin/bookings") ? "text-rust" : "text-ink/55 hover:text-rust"}`}
          >
            Bookings
          </Link>
          <Link
            href="/admin/archive"
            aria-current={pathname.startsWith("/admin/archive") ? "page" : undefined}
            className={`text-[10px] uppercase tracking-[.16em] ${pathname.startsWith("/admin/archive") ? "text-rust" : "text-ink/55 hover:text-rust"}`}
          >
            Archive
          </Link>
        </nav>
        <div className="flex items-center gap-5">
          {error && <span className="text-xs text-rust" role="alert">{error}</span>}
          <span className="hidden text-[10px] uppercase tracking-[.2em] text-ink/50 sm:inline">Studio console</span>
          <button type="button" onClick={logout} className="text-[10px] uppercase tracking-[.2em] text-ink/55 hover:text-rust">
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
