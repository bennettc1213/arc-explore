import {
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";

export function normalizeSchoolEmail(email: string) {
  const [local, domain] = email.trim().toLowerCase().split("@");
  return `${local.split("+")[0]}@${domain}`;
}
export function schoolEmailHash(email: string) {
  return createHash("sha256").update(normalizeSchoolEmail(email)).digest("hex");
}
export function hashStudentCode(code: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(code, salt, 32).toString("hex")}`;
}
export function matchesStudentCode(code: string, hash: string) {
  const [salt, expected] = hash.split(":");
  if (!salt || !expected || !/^\d{6}$/.test(code)) return false;
  const actual = scryptSync(code, salt, 32);
  const target = Buffer.from(expected, "hex");
  return target.length === actual.length && timingSafeEqual(target, actual);
}
