import { eq, and } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, exchangeAccounts, InsertExchangeAccount, ExchangeAccount } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) { console.warn("[Database] Cannot upsert user: database not available"); return; }

  try {
    const values: InsertUser = { openId: user.openId };
    const updateSet: Record<string, unknown> = {};
    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };
    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) { values.lastSignedIn = user.lastSignedIn; updateSet.lastSignedIn = user.lastSignedIn; }
    if (user.role !== undefined) { values.role = user.role; updateSet.role = user.role; }
    else if (user.openId === ENV.ownerOpenId) { values.role = 'admin'; updateSet.role = 'admin'; }
    if (!values.lastSignedIn) values.lastSignedIn = new Date();
    if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();

    await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ─── Local Auth Queries ────────────────────────────────────────────────────

export async function getUserByUsername(username: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.username, username)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function createLocalUser(username: string, passwordHash: string, name: string): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const openId = `local:${username}`;
  const result = await db.insert(users).values({
    openId,
    username,
    passwordHash,
    name,
    loginMethod: "local",
    lastSignedIn: new Date(),
  });
  return (result[0] as { insertId: number }).insertId;
}

export async function updateUserLastSignedIn(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ lastSignedIn: new Date() }).where(eq(users.id, id));
}

// ─── Exchange Account Queries ──────────────────────────────────────────────

export async function getExchangeAccountsByUserId(userId: number): Promise<ExchangeAccount[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(exchangeAccounts)
    .where(and(eq(exchangeAccounts.userId, userId), eq(exchangeAccounts.isActive, true)));
}

export async function getExchangeAccountById(id: number, userId: number): Promise<ExchangeAccount | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(exchangeAccounts)
    .where(and(eq(exchangeAccounts.id, id), eq(exchangeAccounts.userId, userId)))
    .limit(1);
  return result[0];
}

export async function createExchangeAccount(data: InsertExchangeAccount): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(exchangeAccounts).values(data);
  return (result[0] as { insertId: number }).insertId;
}

export async function updateExchangeAccount(id: number, userId: number, data: Partial<InsertExchangeAccount>): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(exchangeAccounts)
    .set(data)
    .where(and(eq(exchangeAccounts.id, id), eq(exchangeAccounts.userId, userId)));
}

export async function deleteExchangeAccount(id: number, userId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // Soft delete
  await db.update(exchangeAccounts)
    .set({ isActive: false })
    .where(and(eq(exchangeAccounts.id, id), eq(exchangeAccounts.userId, userId)));
}
