import crypto from "crypto";
import stringify from "json-stable-stringify";

export function toCanonicalJson(value: unknown): string {
  return stringify(value) ?? "null";
}

export function buildSourceHash(value: unknown): string {
  return crypto.createHash("sha256").update(toCanonicalJson(value)).digest("hex");
}
