import "server-only";
import { Resend } from "resend";

export async function sendClientPortalAccessLink(email: string, token: string) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!apiKey || !from || !siteUrl) {
    console.error("CLIENT_PORTAL_EMAIL_FAILED", { errorCategory: "configuration" });
    return false;
  }

  let link: string;
  try {
    const url = new URL("/portal/verify", siteUrl);
    link = `${url.toString()}#token=${token}`;
  } catch {
    console.error("CLIENT_PORTAL_EMAIL_FAILED", { errorCategory: "configuration" });
    return false;
  }

  try {
    const result = await new Resend(apiKey).emails.send({
      from,
      to: email,
      subject: "Your private Iron Halo client portal link",
      text: `Use this link within 15 minutes to access your private client portal:\n\n${link}\n\nIf you did not request this link, you can ignore this email.`,
      html: `<p>Use this link within 15 minutes to access your private client portal:</p><p><a href="${link}">Open your client portal</a></p><p>If you did not request this link, you can ignore this email.</p>`,
    });
    if (result.error) throw new Error("Email provider rejected the request.");
    return true;
  } catch {
    console.error("CLIENT_PORTAL_EMAIL_FAILED", { errorCategory: "provider" });
    return false;
  }
}
