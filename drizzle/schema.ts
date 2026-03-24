import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, boolean } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  // Local auth fields
  username: varchar("username", { length: 64 }).unique(),
  passwordHash: varchar("passwordHash", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Supported exchange types
 */
export const exchangeAccounts = mysqlTable("exchange_accounts", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  exchangeType: varchar("exchangeType", { length: 32 }).notNull().default("lighter"), // lighter | binance | okx etc.
  label: varchar("label", { length: 128 }).notNull(), // user-defined label e.g. "Main Account"
  // Lighter-specific fields
  accountIndex: varchar("accountIndex", { length: 64 }), // Lighter account index
  apiKeyIndex: varchar("apiKeyIndex", { length: 16 }),   // Lighter API key index (2-254)
  l1Address: varchar("l1Address", { length: 64 }),       // Ethereum L1 address
  // Encrypted sensitive fields (AES-256-GCM, stored as base64 JSON: {iv, tag, ciphertext})
  encryptedApiKey: text("encryptedApiKey"),              // Encrypted API public key
  encryptedPrivateKey: text("encryptedPrivateKey"),      // Encrypted API private key
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ExchangeAccount = typeof exchangeAccounts.$inferSelect;
export type InsertExchangeAccount = typeof exchangeAccounts.$inferInsert;
