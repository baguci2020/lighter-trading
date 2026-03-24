import crypto from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { Request } from "express";
import { ENV } from "./_core/env";
import { getSessionCookieOptions } from "./_core/cookies";
import { getUserById } from "./db";

// ─── Password Hashing (PBKDF2) ─────────────────────────────────────────────

const ITERATIONS = 100_000;
const KEY_LEN = 64;
const DIGEST = "sha512";

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = await new Promise<string>((resolve, reject) => {
    crypto.pbkdf2(password, salt, ITERATIONS, KEY_LEN, DIGEST, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey.toString("hex"));
    });
  });
  return `pbkdf2$${ITERATIONS}$${salt}$${hash}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
  const [, iterStr, salt, expectedHash] = parts;
  const iterations = parseInt(iterStr, 10);
  const hash = await new Promise<string>((resolve, reject) => {
    crypto.pbkdf2(password, salt, iterations, KEY_LEN, DIGEST, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey.toString("hex"));
    });
  });
  // Constant-time comparison
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(expectedHash, "hex"));
}

// ─── Session JWT (reuses existing JWT_SECRET) ─────────────────────────────

function getSessionSecret() {
  const secret = ENV.cookieSecret || "lighter-trading-default-secret-change-in-production";
  return new TextEncoder().encode(secret);
}

export async function createLocalSessionToken(userId: number, username: string): Promise<string> {
  const secretKey = getSessionSecret();
  const expirationSeconds = Math.floor((Date.now() + ONE_YEAR_MS) / 1000);
  return new SignJWT({ userId, username, type: "local" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setExpirationTime(expirationSeconds)
    .sign(secretKey);
}

export async function verifyLocalSession(cookieValue: string | undefined | null): Promise<{ userId: number; username: string } | null> {
  if (!cookieValue) return null;
  try {
    const secretKey = getSessionSecret();
    const { payload } = await jwtVerify(cookieValue, secretKey, { algorithms: ["HS256"] });
    const { userId, username, type } = payload as Record<string, unknown>;
    if (type !== "local" || typeof userId !== "number" || typeof username !== "string") return null;
    return { userId, username };
  } catch {
    return null;
  }
}

// ─── Request Authentication ────────────────────────────────────────────────

export async function authenticateLocalRequest(req: Request) {
  const cookieHeader = req.headers.cookie ?? "";
  const cookies = Object.fromEntries(
    cookieHeader.split(";").map(c => {
      const [k, ...v] = c.trim().split("=");
      return [k.trim(), decodeURIComponent(v.join("="))];
    })
  );
  const sessionCookie = cookies[COOKIE_NAME];
  const session = await verifyLocalSession(sessionCookie);
  if (!session) return null;
  const user = await getUserById(session.userId);
  return user ?? null;
}
