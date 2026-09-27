import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db/prisma";

export const clientSessionCookie = "iron_halo_client_session";
export const clientAccessTokenLifetimeMs = 15 * 60 * 1000;
export const clientSessionLifetimeSeconds = 60 * 60 * 24 * 7;

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function hashClientToken(token: string) {
  return hashToken(token);
}

export function createOpaqueToken() {
  return randomBytes(32).toString("base64url");
}

export async function getCurrentClientSession() {
  const token = cookies().get(clientSessionCookie)?.value;
  if (!token) return null;
  const session = await prisma.clientSession.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { id: true, bookingRequestId: true, expiresAt: true },
  });
  if (!session) return null;
  if (session.expiresAt <= new Date()) {
    await prisma.clientSession.delete({ where: { id: session.id } });
    return null;
  }
  return session;
}

export function clientSessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: clientSessionLifetimeSeconds,
  };
}
