"use client";

import React from "react";
import { FormEvent, useEffect, useState } from "react";

export default function ClientPortalLogin() {
  const [token, setToken] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const candidate = fragment.get("token");
    if (candidate && /^[A-Za-z0-9_-]{43}$/.test(candidate)) setToken(candidate);
    if (window.location.hash) window.history.replaceState(null, "", "/portal/verify");
  }, []);

  async function requestLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      const response = await fetch("/api/client/auth/request-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.get("email"),
          bookingReference: form.get("bookingReference"),
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to request a sign-in link.");
      setMessage(payload.message);
      formElement.reset();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to request a sign-in link.");
    } finally {
      setBusy(false);
    }
  }

  async function verifyLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/client/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (!response.ok) throw new Error("This sign-in link is invalid or has expired. Request a new link.");
      window.location.assign("/portal");
    } catch (verifyError) {
      setError(verifyError instanceof Error ? verifyError.message : "Unable to sign in with that link.");
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-ink px-5 py-12 text-bone">
      <section className="w-full max-w-xl border border-white/15 p-7 sm:p-12">
        <p className="eyebrow">IRON HALO TATTOO CO. · PRIVATE CLIENT SPACE</p>
        <h1 className="mt-6 font-display text-6xl sm:text-7xl">Your portal.</h1>
        {token ? (
          <>
            <p className="mt-6 max-w-md text-sm leading-7 text-bone/65">Continue to your private booking space. This one-time link expires shortly and can only be used once.</p>
            <form onSubmit={verifyLink} className="mt-8">
              <button className="button-primary" disabled={busy}>{busy ? "Signing in…" : "Continue securely"}</button>
            </form>
          </>
        ) : (
          <>
            <p className="mt-6 max-w-md text-sm leading-7 text-bone/65">Enter the email address used for your booking and your booking reference. We’ll send a private sign-in link if they match.</p>
            <form onSubmit={requestLink} className="mt-9 space-y-6">
              <div>
                <label className="eyebrow" htmlFor="portal-email">Email address</label>
                <input id="portal-email" name="email" type="email" autoComplete="email" required maxLength={254} className="mt-3 w-full border-b border-white/25 bg-transparent py-3 text-sm outline-none focus:border-rust" />
              </div>
              <div>
                <label className="eyebrow" htmlFor="booking-reference">Booking reference</label>
                <input id="booking-reference" name="bookingReference" autoComplete="off" required minLength={6} maxLength={40} className="mt-3 w-full border-b border-white/25 bg-transparent py-3 text-sm uppercase outline-none focus:border-rust" />
              </div>
              <button className="button-primary" disabled={busy}>{busy ? "Sending…" : "Request sign-in link"}</button>
            </form>
          </>
        )}
        {message && <p className="mt-6 border-l border-rust pl-4 text-sm leading-6 text-bone/70" role="status">{message}</p>}
        {error && <p className="mt-6 text-sm text-rust" role="alert">{error}</p>}
      </section>
    </main>
  );
}
