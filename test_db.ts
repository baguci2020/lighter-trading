import "dotenv/config";
import { drizzle } from "drizzle-orm/mysql2";
import { users } from "./drizzle/schema";
console.log("DATABASE_URL:", process.env.DATABASE_URL ? "set" : "NOT SET");
const db = drizzle(process.env.DATABASE_URL!);
const result = await db.select().from(users).limit(1);
console.log("DB query OK, users:", result.length);
