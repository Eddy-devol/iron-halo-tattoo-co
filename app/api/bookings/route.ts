import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { prisma } from "@/lib/db/prisma";
import { completeIdempotentBooking, createBookingRequest, isValidIdempotencyKey } from "@/lib/server/services/booking-service";
import { createHash } from "node:crypto";
import { sendNewBookingNotifications } from "@/lib/server/email/resend";
import { deletePrivateObject, uploadPrivateObject } from "@/lib/server/storage/s3";
import { allowedImageTypes, extensionForMimeType, hasValidImageSignature, maxReferenceImageBytes, maxReferenceImages } from "@/lib/server/storage/image-validation";
import { bookingRequestSchema } from "@/lib/validation/booking";
import { enforceRateLimit, requestBodyTooLarge, requestIpKey } from "@/lib/server/security";
import { safeErrorCategory } from "@/lib/server/safe-error-category";

function text(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value : "";
}

function isAllowedImageType(type: string): type is (typeof allowedImageTypes)[number] {
  return (allowedImageTypes as readonly string[]).includes(type);
}

function requestHash(input: unknown, files: Array<{ type: string; name: string; body: Buffer }>) {
  const hash = createHash("sha256");
  hash.update(JSON.stringify(input));
  for (const file of files) {
    hash.update(file.type);
    hash.update(file.name);
    hash.update(file.body);
  }
  return hash.digest("hex");
}

async function deleteUploadedObjects(keys: string[]) {
  for (const key of keys) {
    try {
      await deletePrivateObject(key);
    } catch (error) {
      console.error("BOOKING_IMAGE_CLEANUP_FAILED", { errorCategory: safeErrorCategory(error) });
    }
  }
}

async function deleteBookingAfterFailure(id: string, referenceNumber: string) {
  try {
    await prisma.$transaction([
      prisma.auditLog.deleteMany({ where: { entityType: "BookingRequest", entityId: referenceNumber } }),
      prisma.bookingRequest.delete({ where: { id } }),
    ]);
  } catch (error) {
    console.error("BOOKING_CLEANUP_FAILED", { errorCategory: safeErrorCategory(error) });
  }
}

export async function POST(request: Request) {
  if (requestBodyTooLarge(request, 55 * 1024 * 1024)) {
    return NextResponse.json({ success: false, error: "Request is too large." }, { status: 413 });
  }
  const rateLimit = await enforceRateLimit(request, {
    key: `booking:${requestIpKey(request)}`,
    limit: 5,
    window: "15 m",
    event: "BOOKING_RATE_LIMITED",
  });
  if (!rateLimit.allowed) {
    if ("unavailable" in rateLimit) return NextResponse.json({ success: false, error: "Service temporarily unavailable." }, { status: 503 });
    console.warn("BOOKING_RATE_LIMITED");
    return NextResponse.json({ success: false, error: "Too many requests. Please try again later." }, { status: 429, headers: { "Retry-After": String(rateLimit.retryAfter) } });
  }
  console.info("BOOKING_REQUEST_RECEIVED");
  let createdBooking: { id: string; referenceNumber: string } | undefined;
  const uploadedKeys: string[] = [];
  try {
    const form = await request.formData();
    if (text(form.get("website")).trim()) return NextResponse.json({ success: true, referenceNumber: "IH-SPAM" }, { status: 201 });

    const parsed = bookingRequestSchema.safeParse({
      fullName: text(form.get("fullName")), email: text(form.get("email")), phone: text(form.get("phone")),
      description: text(form.get("description")), style: text(form.get("style")), placement: text(form.get("placement")),
      size: text(form.get("size")), colorPreference: text(form.get("colorPreference")),
      preferredTimeframe: text(form.get("preferredTimeframe")), budget: text(form.get("budget")),
      additionalNotes: text(form.get("additionalNotes")), consent: text(form.get("consent")),
    });
    if (!parsed.success) {
      console.warn("BOOKING_REQUEST_VALIDATION_FAILED", { issueCount: parsed.error.issues.length });
      return NextResponse.json({ error: "Please check the required fields." }, { status: 400 });
    }

    const idempotencyKey = request.headers.get("Idempotency-Key")?.trim() || undefined;
    if (!idempotencyKey) {
      return NextResponse.json({ error: "An Idempotency-Key header is required." }, { status: 400 });
    }
    if (!isValidIdempotencyKey(idempotencyKey)) {
      return NextResponse.json({ error: "Invalid idempotency key." }, { status: 400 });
    }

    const files = form.getAll("referenceImages").filter((value): value is File => value instanceof File && value.name !== "");
    if (files.length > maxReferenceImages) return NextResponse.json({ error: `Maximum ${maxReferenceImages} reference images allowed.` }, { status: 400 });
    const fileData = [] as Array<{ file: File; body: Buffer; extension: string }>;
    for (const file of files) {
      if (!isAllowedImageType(file.type) || file.size > maxReferenceImageBytes || file.size === 0) {
        return NextResponse.json({ error: "Reference images must be JPG, PNG, or WebP files under 10MB each." }, { status: 400 });
      }
      const body = Buffer.from(await file.arrayBuffer());
      const extension = extensionForMimeType(file.type);
      if (!extension || !hasValidImageSignature(body, file.type)) {
        return NextResponse.json({ error: "One or more reference images are not valid image files." }, { status: 400 });
      }
      fileData.push({ file, body, extension });
    }

    const result = await createBookingRequest(
      parsed.data,
      { key: idempotencyKey, hash: requestHash(parsed.data, fileData.map(({ file, body }) => ({ type: file.type, name: file.name, body }))) },
    );
    if ("kind" in result) {
      if (result.kind === "conflict") return NextResponse.json({ error: "This idempotency key was already used for a different request." }, { status: 409 });
      if (result.kind === "processing") return NextResponse.json({ error: "This booking request is already being processed. Please retry shortly." }, { status: 409 });
      if (result.kind === "completed") {
        return NextResponse.json({ success: true, referenceNumber: result.booking.referenceNumber }, { status: 201 });
      }
      createdBooking = result.booking;
    } else {
      createdBooking = result;
    }
    for (const { file, body, extension } of fileData) {
      const key = `booking-reference-images/${createdBooking.referenceNumber}/${crypto.randomUUID()}.${extension}`;
      await uploadPrivateObject(key, body, file.type);
      uploadedKeys.push(key);
    }

    if (uploadedKeys.length > 0) {
      await prisma.$transaction(async (transaction) => {
        await transaction.bookingReferenceImage.createMany({
          data: uploadedKeys.map((storageKey, index) => ({
            bookingRequestId: createdBooking!.id,
            storageKey,
            originalFilename: fileData[index].file.name,
            mimeType: fileData[index].file.type,
            fileSize: fileData[index].file.size,
          })),
        });
        await transaction.auditLog.create({
          data: { action: "BOOKING_IMAGES_UPLOADED", entityType: "BookingRequest", entityId: createdBooking!.referenceNumber, metadata: { count: uploadedKeys.length } },
        });
      });
    }

    await completeIdempotentBooking(createdBooking.id);
    await sendNewBookingNotifications({
      id: createdBooking.id,
      referenceNumber: createdBooking.referenceNumber,
      fullName: parsed.data.fullName,
      email: parsed.data.email,
      phone: parsed.data.phone ?? null,
      style: parsed.data.style ?? null,
      placement: parsed.data.placement,
      size: parsed.data.size,
      preferredTimeframe: parsed.data.preferredTimeframe ?? null,
      budget: parsed.data.budget ?? null,
    });
    console.info("BOOKING_REQUEST_CREATED", { referenceNumber: createdBooking.referenceNumber, imageCount: uploadedKeys.length });
    return NextResponse.json({ success: true, referenceNumber: createdBooking.referenceNumber }, { status: 201 });
  } catch (error) {
    if (uploadedKeys.length > 0) await deleteUploadedObjects(uploadedKeys);
    if (createdBooking) await deleteBookingAfterFailure(createdBooking.id, createdBooking.referenceNumber);
    if (error instanceof ZodError) return NextResponse.json({ error: "Please check the required fields." }, { status: 400 });
    console.error("BOOKING_REQUEST_FAILED", { errorCategory: safeErrorCategory(error) });
    return NextResponse.json({ error: "Something went wrong while submitting your request. Please try again." }, { status: 500 });
  }
}
