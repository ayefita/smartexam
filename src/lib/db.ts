import fs from "fs";
import path from "path";
import { createHash } from "crypto";
import postgres from "postgres";
import { SCHEMA } from "./schema";

export type QueryFn = (text: string, params?: unknown[]) => Promise<Record<string, unknown>[]>;

type Runner = {
  exec: (sql: string) => Promise<void>;
  query: QueryFn;
  tx: <T>(fn: (q: QueryFn) => Promise<T>) => Promise<T>;
};

const globalForDb = globalThis as unknown as { __smartexam?: Promise<Runner>; __smartexamRunner?: Runner };

function databaseUrl() {
  const url = process.env.NETLIFY_DB_URL || process.env.DATABASE_URL || "";
  // Supabase session mode allows only ~15 clients in total, and every serverless instance holds one.
  // Transaction mode (port 6543) shares connections, which is what 400 students at once need.
  if (process.env.DB_POOL_MODE === "transaction") return url.replace(/(pooler\.supabase\.com):5432/, "$1:6543");
  return url;
}

const BUSY = /EMAXCONN|max clients|MaxClients|too many clients|remaining connection slots|CONNECT_TIMEOUT|ECONNRESET|Connection terminated/i;

/** Retry a query a few times when the pool is momentarily full or a connection dropped. */
async function withRetry<T>(run: () => Promise<T>) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      if (attempt >= 3 || !BUSY.test(String((error as Error)?.message || error))) throw error;
      await new Promise((resolve) => setTimeout(resolve, 150 * 2 ** attempt + Math.random() * 150));
    }
  }
}

export function usingLocalFile() {
  const url = databaseUrl();
  return !url || url.startsWith("file:");
}

/**
 * Callers pass JSON as already-stringified text (`$3::jsonb` with JSON.stringify). postgres.js
 * would see a jsonb parameter and encode that string a second time, storing a JSON string instead
 * of an array or object. Casting through text keeps the value exactly as the caller wrote it.
 */
function jsonText(text: string) {
  return text.replace(/(\$\d+)::jsonb/g, "$1::text::jsonb");
}

function needsSsl(url: string) {
  return !/localhost|127\.0\.0\.1|\[::1\]/.test(url);
}

async function createRunner(): Promise<Runner> {
  const url = databaseUrl();
  if (process.env.NODE_ENV === "production" && (!url || url.startsWith("file:"))) {
    throw new Error("Production requires DATABASE_URL or NETLIFY_DB_URL. The local file database is not durable on Netlify or Vercel.");
  }
  if (url && !url.startsWith("file:")) {
    const serverless = Boolean(process.env.VERCEL || process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME);
    const pooled = /pgbouncer=true|:6543|pooler\.supabase/.test(url);
    const sql = postgres(url, {
      max: serverless ? 1 : 4,
      ssl: needsSsl(url) ? "require" : false,
      idle_timeout: 20,
      connect_timeout: 10,
      prepare: !pooled,
    });
    return {
      async exec(text) {
        await sql.unsafe(text);
      },
      async query(text, params = []) {
        return withRetry(async () => (await sql.unsafe(jsonText(text), params as never[])) as unknown as Record<string, unknown>[]);
      },
      tx<T>(fn: (q: QueryFn) => Promise<T>) {
        return sql.begin(async (trx) => {
          const q: QueryFn = async (text, params = []) =>
            (await trx.unsafe(jsonText(text), params as never[])) as unknown as Record<string, unknown>[];
          return fn(q);
        }) as Promise<T>;
      },
    };
  }

  const dir = path.join(process.cwd(), "data", "pglite");
  fs.mkdirSync(dir, { recursive: true });
  const { PGlite } = await import("@electric-sql/pglite");
  const client = new PGlite(dir);
  await client.waitReady;
  return {
    async exec(text) {
      await client.exec(text);
    },
    async query(text, params = []) {
      const res = await client.query<Record<string, unknown>>(text, params);
      return res.rows;
    },
    tx(fn) {
      return client.transaction(async (trx) => {
        const q: QueryFn = async (text, params = []) => {
          const res = await trx.query<Record<string, unknown>>(text, params);
          return res.rows;
        };
        return fn(q);
      });
    },
  };
}

const SCHEMA_VERSION = createHash("sha1").update(SCHEMA).digest("hex").slice(0, 16);

/** Runs the full schema only when it changed since the last boot; otherwise one tiny read. */
async function ensureSchema(runner: Runner) {
  let current = "";
  try {
    const rows = await runner.query(`select value from app_meta where key = 'schema'`);
    current = String(rows[0]?.value ?? "");
  } catch (error) {
    // First boot on this database: app_meta does not exist yet. Anything else (a network drop) is a real error.
    if (!/app_meta|does not exist|42P01/.test(String((error as { code?: string })?.code || "") + String((error as Error)?.message || ""))) throw error;
  }
  if (current === SCHEMA_VERSION) return;
  await runner.exec(SCHEMA);
  await runner.query(
    `insert into app_meta (key, value, updated_at) values ('schema', $1, now())
     on conflict (key) do update set value = excluded.value, updated_at = now()`,
    [SCHEMA_VERSION],
  );
}

async function init(): Promise<Runner> {
  const started = Date.now();
  const runner = await createRunner();
  await ensureSchema(runner);
  if (process.env.VERCEL || process.env.NETLIFY) console.log(`[db] ready in ${Date.now() - started}ms`);
  globalForDb.__smartexamRunner = runner;
  const { seedIfEmpty } = await import("./seed");
  await seedIfEmpty();
  return runner;
}

function runnerPromise() {
  if (!globalForDb.__smartexam) {
    globalForDb.__smartexam = init().catch((error) => {
      globalForDb.__smartexam = undefined;
      globalForDb.__smartexamRunner = undefined;
      throw error;
    });
  }
  return globalForDb.__smartexam;
}

async function getRunner() {
  if (globalForDb.__smartexamRunner) return globalForDb.__smartexamRunner;
  const runner = await runnerPromise();
  globalForDb.__smartexamRunner = runner;
  return runner;
}

/** Logs queries that take unusually long, so a stuck page can be traced from the host's logs. */
async function watched<T>(label: string, run: () => Promise<T>) {
  const started = Date.now();
  const timer = setTimeout(() => console.warn(`[db] still waiting after 10s: ${label}`), 10_000);
  try {
    return await run();
  } finally {
    clearTimeout(timer);
    const took = Date.now() - started;
    if (took > 3000) console.warn(`[db] slow ${took}ms: ${label}`);
  }
}

function labelOf(text: string) {
  return text.replace(/\s+/g, " ").trim().slice(0, 80);
}

export async function query<T = Record<string, unknown>>(text: string, params: unknown[] = []) {
  return watched(labelOf(text), async () => {
    const runner = await getRunner();
    return runner.query(text, params) as Promise<T[]>;
  });
}

export async function tx<T>(fn: (q: QueryFn) => Promise<T>) {
  return watched("transaction", async () => {
    const runner = await getRunner();
    return runner.tx(fn);
  });
}

export async function exec(sql: string) {
  const runner = await getRunner();
  await runner.exec(sql);
}

export async function ensureReady() {
  await getRunner();
}
