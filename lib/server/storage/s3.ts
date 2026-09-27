import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

function configuration() {
  const bucket = process.env.STORAGE_BUCKET;
  const accessKeyId = process.env.STORAGE_ACCESS_KEY_ID;
  const secretAccessKey = process.env.STORAGE_SECRET_ACCESS_KEY;
  if (!bucket || !accessKeyId || !secretAccessKey) throw new Error("Private storage is not configured");
  return { bucket, accessKeyId, secretAccessKey };
}

function client() {
  const { accessKeyId, secretAccessKey } = configuration();
  return new S3Client({
    region: process.env.STORAGE_REGION || "us-east-1",
    endpoint: process.env.STORAGE_ENDPOINT || undefined,
    forcePathStyle: process.env.STORAGE_FORCE_PATH_STYLE === "true",
    credentials: { accessKeyId, secretAccessKey },
  });
}

export async function uploadPrivateObject(key: string, body: Buffer, contentType: string) {
  const { bucket } = configuration();
  await client().send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }));
}

export async function deletePrivateObject(key: string) {
  const { bucket } = configuration();
  await client().send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

export async function readPrivateObject(key: string) {
  const { bucket } = configuration();
  const result = await client().send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (!result.Body) throw new Error("Stored object has no response body.");
  return result.Body.transformToByteArray();
}

export async function createSignedReadUrl(key: string, expiresIn = 300) {
  const { bucket } = configuration();
  return getSignedUrl(client(), new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn });
}
