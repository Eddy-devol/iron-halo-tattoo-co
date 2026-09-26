import { BookingStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getCurrentAdmin } from "@/lib/server/auth";
import { safeErrorCategory } from "@/lib/server/safe-error-category";

const querySchema = z.object({
  search: z.string().trim().max(200).default(""),
  status: z.nativeEnum(BookingStatus).optional(),
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export async function GET(request: Request) {
  if (!(await getCurrentAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    search: url.searchParams.get("search") ?? "",
    status: url.searchParams.get("status") || undefined,
    page: url.searchParams.get("page") ?? undefined,
    pageSize: url.searchParams.get("pageSize") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid booking query parameters." }, { status: 400 });
  }

  const { search, status, page, pageSize } = parsed.data;
  const where = {
    ...(status ? { status } : {}),
    ...(search
      ? {
          OR: [
            { referenceNumber: { contains: search, mode: "insensitive" as const } },
            { fullName: { contains: search, mode: "insensitive" as const } },
            { email: { contains: search, mode: "insensitive" as const } },
            { phone: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  try {
    const [bookings, total] = await Promise.all([
      prisma.bookingRequest.findMany({
        where,
        select: {
          id: true,
          referenceNumber: true,
          fullName: true,
          email: true,
          phone: true,
          status: true,
          createdAt: true,
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.bookingRequest.count({ where }),
    ]);

    return NextResponse.json({
      bookings: bookings.map((booking) => ({
        ...booking,
        createdAt: booking.createdAt.toISOString(),
      })),
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    });
  } catch (error) {
    console.error("ADMIN_BOOKINGS_LIST_FAILED", { errorCategory: safeErrorCategory(error) });
    return NextResponse.json({ error: "Unable to load bookings." }, { status: 500 });
  }
}
