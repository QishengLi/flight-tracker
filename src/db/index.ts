import { neon } from "@neondatabase/serverless";
import { drizzle, NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "./schema";

let _db: NeonHttpDatabase<typeof schema> | null = null;

// Lazy initialization so the module can be imported at build time without
// DATABASE_URL being set (Next.js evaluates imports during static analysis).
export const db = new Proxy({} as NeonHttpDatabase<typeof schema>, {
  get(_, prop: string | symbol) {
    if (!_db) {
      const sql = neon(process.env.DATABASE_URL!);
      _db = drizzle(sql, { schema });
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const value = (_db as any)[prop];
    return typeof value === "function" ? value.bind(_db) : value;
  },
});
