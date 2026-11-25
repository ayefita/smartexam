import fs from "fs";
import path from "path";
import { exec, query } from "../src/lib/db";
import { seedIfEmpty } from "../src/lib/seed";

const command = process.argv[2];

async function migrate() {
  const root = path.join(process.cwd(), "netlify", "database", "migrations");
  const dirs = fs.readdirSync(root).filter((name) => fs.existsSync(path.join(root, name, "migration.sql"))).sort();
  for (const dir of dirs) {
    const file = path.join(root, dir, "migration.sql");
    await exec(fs.readFileSync(file, "utf8"));
    console.log(`Applied netlify/database/migrations/${dir}/migration.sql`);
  }
}

async function seed() {
  await seedIfEmpty({ force: true });
  const rows = await query<{ n: number }>(`select count(*)::int as n from users`);
  console.log(`Seed finished. Users in database: ${rows[0]?.n ?? 0}`);
}

async function main() {
  if (!process.env.DATABASE_URL && !process.env.NETLIFY_DB_URL) {
    console.log("No DATABASE_URL or NETLIFY_DB_URL. Using the local file database in ./data/pglite.");
  }
  if (command === "migrate") await migrate();
  else if (command === "seed") await seed();
  else {
    console.error("Usage: tsx scripts/db.ts migrate|seed");
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
