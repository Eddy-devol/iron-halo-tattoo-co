const knownErrorNames = new Set([
  "Error",
  "TypeError",
  "RangeError",
  "SyntaxError",
  "PrismaClientKnownRequestError",
  "PrismaClientUnknownRequestError",
  "PrismaClientInitializationError",
  "PrismaClientValidationError",
  "S3ServiceException",
  "TimeoutError",
  "AbortError",
]);

export function safeErrorCategory(error: unknown) {
  if (!(error instanceof Error)) return "unknown";
  return knownErrorNames.has(error.name) ? error.name : "unknown";
}
