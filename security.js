import crypto from "node:crypto";

/**
 * Generates an HMAC-SHA256 signature for an outbound webhook payload.
 */
export function signPayload(secret, rawBody) {
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(rawBody, "utf8");
  return `sha256=${hmac.digest("hex")}`;
}

/**
 * Verifies an incoming HMAC-SHA256 signature using constant-time comparison
 * to prevent timing attacks.
 */
export function verifySignature(secret, rawBody, signatureHeader) {
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) {
    return false;
  }
  const expected = signPayload(secret, rawBody);
  const expectedBuf = Buffer.from(expected, "utf8");
  const actualBuf = Buffer.from(signatureHeader, "utf8");

  if (expectedBuf.length !== actualBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(expectedBuf, actualBuf);
}
