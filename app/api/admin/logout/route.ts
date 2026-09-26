import { NextResponse } from "next/server";
import { adminSessionCookie, deleteCurrentAdminSession } from "@/lib/server/auth";
import { rejectedOriginResponse, validateMutationOrigin } from "@/lib/server/security";

export async function POST(request: Request) {
  if (!validateMutationOrigin(request)) {
    console.warn("CSRF_ORIGIN_REJECTED");
    return NextResponse.json(rejectedOriginResponse(), { status: 403 });
  }
  await deleteCurrentAdminSession();
  const response = NextResponse.json({ success: true });
  response.cookies.set(adminSessionCookie, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
  return response;
}
