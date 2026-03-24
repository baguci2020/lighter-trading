import { describe, expect, it, beforeAll } from "vitest";
import { encrypt, decrypt } from "./crypto";

// Set JWT_SECRET env for tests
beforeAll(() => {
  process.env.JWT_SECRET = "test-secret-for-unit-tests-only-not-production";
});

describe("crypto - AES-256-GCM", () => {
  it("encrypts and decrypts a string correctly", () => {
    const plaintext = "my-secret-private-key-80hex-chars-here-test-value-1234567890abcdef";
    const encrypted = encrypt(plaintext);
    expect(encrypted).not.toBe(plaintext);
    // Encrypted result is JSON with iv, tag, ciphertext fields
    const parsed = JSON.parse(encrypted);
    expect(parsed).toHaveProperty("iv");
    expect(parsed).toHaveProperty("tag");
    expect(parsed).toHaveProperty("ciphertext");
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it("produces different ciphertext for same input (random IV)", () => {
    const plaintext = "same-input-text";
    const enc1 = encrypt(plaintext);
    const enc2 = encrypt(plaintext);
    // IVs should differ even though plaintexts are the same
    const p1 = JSON.parse(enc1);
    const p2 = JSON.parse(enc2);
    expect(p1.iv).not.toBe(p2.iv);
    // Both should decrypt to the same value
    expect(decrypt(enc1)).toBe(plaintext);
    expect(decrypt(enc2)).toBe(plaintext);
  });

  it("decrypts correctly after multiple encrypt/decrypt cycles", () => {
    const values = [
      "a".repeat(80),
      "0123456789abcdef".repeat(5),
      "test-api-key-value",
      "short",
    ];
    for (const v of values) {
      expect(decrypt(encrypt(v))).toBe(v);
    }
  });

  it("throws on tampered ciphertext", () => {
    const plaintext = "sensitive-data";
    const encrypted = encrypt(plaintext);
    const parsed = JSON.parse(encrypted);
    // Tamper with the ciphertext
    parsed.ciphertext = Buffer.from("tampered-garbage").toString("base64");
    const tampered = JSON.stringify(parsed);
    expect(() => decrypt(tampered)).toThrow();
  });

  it("throws on tampered auth tag", () => {
    const plaintext = "sensitive-data";
    const encrypted = encrypt(plaintext);
    const parsed = JSON.parse(encrypted);
    // Tamper with the auth tag
    parsed.tag = Buffer.from("0".repeat(16)).toString("base64");
    const tampered = JSON.stringify(parsed);
    expect(() => decrypt(tampered)).toThrow();
  });
});
