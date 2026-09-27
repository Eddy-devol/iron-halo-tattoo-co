import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { clientSessionCookie } from "@/lib/server/client-auth";
import { safeErrorCategory } from "@/lib/server/safe-error-category";
import { validateMutationOrigin } from "@/lib/server/security";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!validateMutationOrigin(request)) {
    return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
  }
  const token = cookies().get(clientSessionCookie)?.value;
  if (token) {
    const tokenHash = createHash("sha256").update(token).digest("hex");
    try {
      await prisma.clientSession.deleteMany({ where: { tokenHash } });
    } catch (error) {
      console.error("CLIENT_PORTAL_LOGOUT_FAILED", { errorCategory: safeErrorCategory(error) });
      return NextResponse.json({ error: "Unable to sign out right now. Please try again." }, { status: 503 });
    }
  }
  const response = NextResponse.json({ success: true });
  response.cookies.set(clientSessionCookie, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}
