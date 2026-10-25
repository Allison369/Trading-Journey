#!/usr/bin/env node
/**
 * Print every TradeVault SQL file in the correct order, or write them to a
 * single file, so the whole database can be set up with one copy-paste into
 * the Supabase SQL editor.
 *
 * Usage:
 *   node scripts/print-sql.mjs              # print all migrations
 *   node scripts/print-sql.mjs --with-seed  # include development seed data
 *   node scripts/print-sql.mjs --out db.sql # write to a file instead
 *   node scripts/print-sql.mjs --check      # list files and exit (no output)
 *
 * The RLS isolation test suite is NOT included: it is meant to be run on its
 * own so its results are easy to read.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

const MIGRATIONS = [
  "supabase/migrations/0001_initial_schema.sql",
  "supabase/migrations/0002_rls_policies.sql",
  "supabase/migrations/0003_storage.sql",
  "supabase/migrations/0004_admin_role.sql",
];

const SEED = "supabase/seed.sql";
const TEST_SUITE = "supabase/tests/rls_isolation_test.sql";

const args = process.argv.slice(2);
const withSeed = args.includes("--with-seed");
const checkOnly = args.includes("--check");
const outIndex = args.indexOf("--out");
const outFile = outIndex >= 0 ? args[outIndex + 1] : null;

const files = [...MIGRATIONS, ...(withSeed ? [SEED] : [])];

const missing = files.filter((f) => !existsSync(join(root, f)));
if (missing.length > 0) {
  console.error("Missing SQL file(s):");
  for (const f of missing) console.error(`  - ${f}`);
  process.exit(1);
}

if (checkOnly) {
  console.log("SQL files found, in run order:");
  for (const f of files) console.log(`  ${f}`);
  console.log("\nNot part of the setup bundle (run separately):");
  console.log(`  ${TEST_SUITE}`);
  process.exit(0);
}

const banner = (rel) =>
  [
    "",
    "/* " + "=".repeat(74),
    ` * FILE: ${rel}`,
    " * " + "=".repeat(74) + " */",
    "",
  ].join("\n");

const parts = files.map((rel) => banner(rel) + readFileSync(join(root, rel), "utf8"));
const bundle = parts.join("\n");

if (outFile) {
  const target = resolve(process.cwd(), outFile);
  writeFileSync(target, bundle, "utf8");
  console.log(`Wrote ${files.length} file(s) to ${target}`);
} else {
  process.stdout.write(bundle);
}
