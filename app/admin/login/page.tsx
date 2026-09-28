"use client";

import { FormEvent, useState } from "react";

export default function AdminLoginPage() {
  const [error, setError] = useState(false);
  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(false);
    const response = await fetch("/api/admin/login", { method: "POST", body: new FormData(event.currentTarget) });
    if (response.ok) window.location.href = "/admin";
    else setError(true);
  }
  return <main className="flex min-h-screen items-center justify-center bg-ink px-5 py-8"><form onSubmit={login} className="surface-card w-full max-w-md p-6 sm:p-12"><p className="eyebrow">Studio console</p><h1 className="mt-5 font-display text-6xl">Sign in.</h1><label className="eyebrow mt-9 block" htmlFor="email">Email</label><input id="email" name="email" type="email" autoComplete="username" required className="field-control field-control-dark mt-2.5" /><label className="eyebrow mt-6 block" htmlFor="password">Password</label><input id="password" name="password" type="password" autoComplete="current-password" required className="field-control field-control-dark mt-2.5" />{error && <p className="mt-4 text-xs text-rust" role="alert">Invalid email or password.</p>}<button className="button-primary mt-8 w-full">Enter console</button></form></main>;
}
