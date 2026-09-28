"use client";

import { FormEvent, useRef, useState } from "react";
import type { StudioContactDetails } from "@/lib/studio-contact";

type State = "idle" | "sending" | "success" | "error";

export default function BookingForm({ contact }: { contact: StudioContactDetails }) {
  const [state, setState] = useState<State>("idle");
  const [reference, setReference] = useState("");
  const idempotencyKey = useRef("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("sending");
    const form = event.currentTarget;
    if (!idempotencyKey.current) idempotencyKey.current = crypto.randomUUID();

    try {
      const response = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Idempotency-Key": idempotencyKey.current },
        body: new FormData(form),
      });
      const result = (await response.json()) as { referenceNumber?: string };
      if (!response.ok || !result.referenceNumber) throw new Error("Booking request failed");
      setReference(result.referenceNumber);
      form.reset();
      idempotencyKey.current = "";
      setState("success");
    } catch {
      setState("error");
    }
  }

  if (state === "success") {
    return (
      <div className="surface-card p-6 sm:p-10" role="status">
        <p className="eyebrow">REQUEST RECEIVED</p>
        <h2 className="mt-5 font-display text-5xl">Thank you.</h2>
        <p className="mt-5 text-sm leading-7 text-bone/65">
          Your booking request has been received. We will review your request before an appointment is confirmed. This request is not an instantly confirmed appointment.
        </p>
        <p className="mt-8 border-t border-white/10 pt-5 text-xs uppercase tracking-[.18em] text-bone/60">
          Reference <strong className="ml-2 text-bone">{reference}</strong>
        </p>
        {(contact.email || contact.phone || contact.facebook) && (
          <div className="mt-8 border-t border-white/10 pt-5">
            <p className="text-sm leading-6 text-bone/65">If you would like to discuss your idea directly, you can also contact the studio:</p>
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-3 text-xs uppercase tracking-[.16em]">
              {contact.email && <a className="text-bone/70 underline decoration-rust/60 underline-offset-4 hover:text-bone" href={contact.email.href}>Email</a>}
              {contact.phone && <a className="text-bone/70 underline decoration-rust/60 underline-offset-4 hover:text-bone" href={contact.phone.href}>Phone</a>}
              {contact.facebook && <a className="text-bone/70 underline decoration-rust/60 underline-offset-4 hover:text-bone" href={contact.facebook.href} target="_blank" rel="noopener noreferrer">Facebook / Messenger</a>}
            </div>
          </div>
        )}
        <button type="button" onClick={() => setState("idle")} className="button-quiet mt-8">Send another</button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="surface-card space-y-9 p-5 sm:p-8 lg:p-10" encType="multipart/form-data">
      <fieldset className="space-y-6 sm:space-y-7">
        <legend className="eyebrow mb-2">01 — About you</legend>
        <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2 sm:gap-y-7">
          <Field label="Full name" name="fullName" required />
          <Field label="Email address" name="email" type="email" required />
          <Field label="Phone (optional)" name="phone" type="tel" />
          <Field label="Preferred timeframe" name="preferredTimeframe" placeholder="e.g. Spring 2026" />
        </div>
      </fieldset>

      <fieldset className="space-y-6 sm:space-y-7">
        <legend className="eyebrow mb-2">02 — Your tattoo</legend>
        <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2 sm:gap-y-7">
          <Field label="Placement" name="placement" required />
          <Field label="Approximate size" name="size" placeholder="e.g. 4 inches" required />
          <Field label="Style" name="style" placeholder="e.g. fine line, blackwork" />
          <div>
            <label className="eyebrow" htmlFor="colorPreference">Color</label>
            <select id="colorPreference" name="colorPreference" className="field-control field-control-dark mt-3">
              <option value="" className="bg-ink">Select one</option>
              <option className="bg-ink">Black & grey</option>
              <option className="bg-ink">Color</option>
              <option className="bg-ink">Open to discussion</option>
            </select>
          </div>
        </div>
        <div className="space-y-3">
          <label className="eyebrow" htmlFor="description">Tell us about the idea</label>
          <textarea id="description" name="description" required minLength={20} maxLength={3000} rows={5} className="field-control field-control-dark min-h-36 resize-y leading-6" placeholder="References, story, scale, anything useful..." />
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="eyebrow mb-2">03 — References</legend>
        <label htmlFor="referenceImages" className="block cursor-pointer border border-dashed border-white/20 p-4 text-sm text-bone/65 transition-colors hover:border-bone/45 hover:bg-white/[.025] sm:p-5">
          <span className="block">Add reference images</span>
          <span className="mt-1 block text-xs leading-5 text-bone/45">Up to 5 JPG, PNG, or WebP images · 10 MB each</span>
          <input id="referenceImages" name="referenceImages" type="file" accept="image/jpeg,image/png,image/webp" multiple className="field-control field-control-dark mt-4 cursor-pointer text-xs" />
        </label>
      </fieldset>

      <input aria-hidden="true" tabIndex={-1} autoComplete="off" name="website" className="hidden" />
      <label className="flex min-h-11 items-start gap-3 border-t border-white/10 pt-5 text-xs leading-5 text-bone/65">
        <input name="consent" type="checkbox" required className="field-checkbox mt-0.5" />
        <span>I confirm this information is accurate and understand this is a booking request, not a guarantee of an appointment.</span>
      </label>
      <div className="flex flex-col items-stretch gap-4 sm:flex-row sm:items-center">
        <button type="submit" disabled={state === "sending"} className="button-primary w-full disabled:cursor-wait disabled:opacity-50 sm:w-auto">
          {state === "sending" ? "Sending…" : <>Send request <span className="link-arrow" aria-hidden="true">↗</span></>}
        </button>
        {state === "error" && <p className="text-xs text-rust" role="alert">Please check your details and try again.</p>}
      </div>
    </form>
  );
}

function Field({ label, name, type = "text", required, placeholder }: { label: string; name: string; type?: string; required?: boolean; placeholder?: string }) {
  return (
    <div>
      <label className="eyebrow block" htmlFor={name}>{label}</label>
      <input id={name} name={name} type={type} required={required} placeholder={placeholder} className="field-control field-control-dark mt-2.5" />
    </div>
  );
}
