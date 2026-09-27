import { NextResponse } from "next/server";
import { getCurrentClientSession } from "@/lib/server/client-auth";
import { getClientPortalBooking } from "@/lib/server/client-portal";
import { safeErrorCategory } from "@/lib/server/safe-error-category";

export const dynamic = "force-dynamic";

export async function GET(_request: Request) {
  try {
    const session = await getCurrentClientSession();
    if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401, headers: { "Cache-Control": "no-store" } });
    const booking = await getClientPortalBooking(session.bookingRequestId);
    if (!booking) return NextResponse.json({ error: "Unauthorized." }, { status: 401, headers: { "Cache-Control": "no-store" } });
    return NextResponse.json({ booking }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("CLIENT_PORTAL_BOOKING_READ_FAILED", { errorCategory: safeErrorCategory(error) });
    return NextResponse.json({ error: "Unable to load the client portal." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
