"use client";

import { FormEvent, useRef, useState } from "react";

type State = "idle" | "sending" | "success" | "error";

export default function BookingForm() {
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
      <div className="border border-rust/50 bg-rust/10 p-8 sm:p-12" role="status">
        <p className="eyebrow">REQUEST RECEIVED</p>
        <h2 className="mt-5 font-display text-5xl">Thank you.</h2>
        <p className="mt-5 text-sm leading-7 text-bone/65">
          Your booking request has been submitted successfully. We will review your request and contact you with the next steps.
        </p>
        <p className="mt-8 border-t border-rust/30 pt-5 text-xs uppercase tracking-[.2em] text-bone/55">
          Reference <strong className="ml-2 text-bone">{reference}</strong>
        </p>
        <button type="button" onClick={() => setState("idle")} className="button-quiet mt-8">Send another</button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-8 border border-white/15 p-6 sm:p-10" encType="multipart/form-data">
      <fieldset className="space-y-7">
        <legend className="eyebrow mb-2">01 â€” About you</legend>
        <div className="grid gap-7 sm:grid-cols-2">
          <Field label="Full name" name="fullName" required />
          <Field label="Email address" name="email" type="email" required />
          <Field label="Phone (optional)" name="phone" type="tel" />
          <Field label="Preferred timeframe" name="preferredTimeframe" placeholder="e.g. Spring 2026" />
        </div>
      </fieldset>

      <fieldset className="space-y-7">
        <legend className="eyebrow mb-2">02 â€” Your tattoo</legend>
        <div className="grid gap-7 sm:grid-cols-2">
          <Field label="Placement" name="placement" required />
          <Field label="Approximate size" name="size" placeholder="e.g. 4 inches" required />
          <Field label="Style" name="style" placeholder="e.g. fine line, blackwork" />
          <div>
            <label className="eyebrow" htmlFor="colorPreference">Color</label>
            <select id="colorPreference" name="colorPreference" className="mt-3 w-full border-b border-white/25 bg-transparent py-3 text-sm text-bone outline-none focus:border-rust">
              <option value="" className="bg-ink">Select one</option>
              <option className="bg-ink">Black & grey</option>
              <option className="bg-ink">Color</option>
              <option className="bg-ink">Open to discussion</option>
            </select>
          </div>
        </div>
        <div>
          <label className="eyebrow" htmlFor="description">Tell us about the idea</label>
          <textarea id="description" name="description" required minLength={20} maxLength={3000} rows={5} className="mt-3 w-full resize-none border-b border-white/25 bg-transparent py-3 text-sm outline-none placeholder:text-bone/25 focus:border-rust" placeholder="References, story, scale, anything useful..." />
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="eyebrow mb-2">03 â€” References</legend>
        <label htmlFor="referenceImages" className="block cursor-pointer border border-dashed border-white/20 p-5 text-sm text-bone/55 transition hover:border-rust hover:text-bone">
          Add up to 5 JPG, PNG, or WebP images (10MB each)
          <input id="referenceImages" name="referenceImages" type="file" accept="image/jpeg,image/png,image/webp" multiple className="mt-3 block w-full text-xs text-bone/45 file:mr-4 file:rounded-full file:border-0 file:bg-bone file:px-4 file:py-2 file:text-xs file:font-bold file:text-ink" />
        </label>
      </fieldset>

      <input aria-hidden="true" tabIndex={-1} autoComplete="off" name="website" className="hidden" />
      <label className="flex items-start gap-3 text-xs leading-5 text-bone/55">
        <input name="consent" type="checkbox" required className="mt-1 accent-rust" />
        <span>I confirm this information is accurate and understand this is a booking request, not a guarantee of an appointment.</span>
      </label>
      <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
        <button type="submit" disabled={state === "sending"} className="button-primary disabled:cursor-wait disabled:opacity-50">
          {state === "sending" ? "Sendingâ€¦" : "Send request â†—"}
        </button>
        {state === "error" && <p className="text-xs text-rust" role="alert">Please check your details and try again.</p>}
      </div>
    </form>
  );
}

function Field({ label, name, type = "text", required, placeholder }: { label: string; name: string; type?: string; required?: boolean; placeholder?: string }) {
  return (
    <div>
      <label className="eyebrow" htmlFor={name}>{label}</label>
      <input id={name} name={name} type={type} required={required} placeholder={placeholder} className="mt-3 w-full border-b border-white/25 bg-transparent py-3 text-sm outline-none placeholder:text-bone/25 focus:border-rust" />
    </div>
  );
}
