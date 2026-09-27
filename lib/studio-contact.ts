export type StudioContactConfiguration = {
  email?: string;
  phone?: string;
  facebookUrl?: string;
};

export type StudioContactDetails = {
  email?: { label: string; href: string };
  phone?: { label: string; href: string };
  facebook?: { label: string; href: string };
};

const facebookHosts = new Set([
  "facebook.com",
  "www.facebook.com",
  "m.facebook.com",
  "messenger.com",
  "www.messenger.com",
  "m.me",
]);

export function resolveStudioContactDetails(configuration: StudioContactConfiguration): StudioContactDetails {
  const details: StudioContactDetails = {};
  const email = configuration.email?.trim();
  if (email && /^[A-Z0-9.!#$%&'*+/^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?)+$/i.test(email)) {
    details.email = { label: email, href: `mailto:${encodeURIComponent(email).replace("%40", "@")}` };
  }

  const phone = configuration.phone?.trim();
  const phoneHref = phone?.replace(/[ ()-]/g, "");
  if (phone && phoneHref && /^[+]?\d{7,15}$/.test(phoneHref) && /^[+\d ()-]+$/.test(phone)) {
    details.phone = { label: phone, href: `tel:${phoneHref}` };
  }

  const facebookUrl = configuration.facebookUrl?.trim();
  if (facebookUrl) {
    try {
      const parsed = new URL(facebookUrl);
      if (parsed.protocol === "https:" && !parsed.username && !parsed.password && facebookHosts.has(parsed.hostname.toLowerCase())) {
        details.facebook = { label: "Facebook / Messenger", href: parsed.toString() };
      }
    } catch {
      return details;
    }
  }

  return details;
}
