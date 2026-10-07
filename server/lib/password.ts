import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt:${salt.toString("base64")}:${derived.toString("base64")}`;
}

export async function verifyPassword(password: string, encoded: string) {
  const [algorithm, saltBase64, hashBase64] = encoded.split(":");
  if (algorithm !== "scrypt" || !saltBase64 || !hashBase64) return false;
  const expected = Buffer.from(hashBase64, "base64");
  const actual = (await scrypt(password, Buffer.from(saltBase64, "base64"), expected.length)) as Buffer;
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
