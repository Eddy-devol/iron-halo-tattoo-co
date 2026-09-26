import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { adminSessionCookie, createAdminSession, sessionCookieOptions } from "@/lib/server/auth";
import { enforceRateLimit, requestBodyTooLarge, requestIpKey } from "@/lib/server/security";

export async function POST(request: Request) {
  if (requestBodyTooLarge(request, 64 * 1024)) {
    return NextResponse.json({ error: "Request is too large." }, { status: 413 });
  }
  const form = await request.formData();
  const parsed = z.object({ email: z.string().trim().email(), password: z.string().min(1) }).safeParse({
    email: form.get("email"),
    password: form.get("password"),
  });
  if (!parsed.success) return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });

  const rateLimit = await enforceRateLimit(request, {
    key: `admin-login:${requestIpKey(request)}:${parsed.data.email.toLowerCase()}`,
    limit: 10,
    window: "15 m",
    event: "ADMIN_LOGIN_RATE_LIMITED",
  });
  if (!rateLimit.allowed) {
    if ("unavailable" in rateLimit) return NextResponse.json({ error: "Service temporarily unavailable." }, { status: 503 });
    console.warn("ADMIN_LOGIN_RATE_LIMITED");
    return NextResponse.json({ error: "Too many login attempts. Please try again later." }, { status: 429, headers: { "Retry-After": String(rateLimit.retryAfter) } });
  }

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
  const valid = user?.role === "ADMIN" && !!user.passwordHash && await bcrypt.compare(parsed.data.password, user.passwordHash);
  if (!valid) {
    console.warn("ADMIN_LOGIN_FAILED");
    return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
  }
  const token = await createAdminSession(user.id);
  const response = NextResponse.json({ success: true });
  response.cookies.set(adminSessionCookie, token, sessionCookieOptions());
  return response;
}
