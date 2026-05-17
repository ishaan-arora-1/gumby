#!/usr/bin/env node
/**
 * Applies a SQL file to the Supabase Postgres database.
 *
 * Usage:
 *   DATABASE_URL=postgres://... node scripts/apply-migration.js migrations/002_ugc.sql
 *
 * If DATABASE_URL is not set, falls back to constructing it from
 * SUPABASE_URL + SUPABASE_DB_PASSWORD.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: node scripts/apply-migration.js <sql-file>');
    process.exit(1);
  }
  const sql = fs.readFileSync(path.resolve(file), 'utf8');

  let connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    const url = process.env.SUPABASE_URL || '';
    const m = url.match(/^https:\/\/([a-z0-9]+)\.supabase\.co/);
    const ref = m && m[1];
    const pw = process.env.SUPABASE_DB_PASSWORD;
    if (!ref || !pw) {
      console.error('Set DATABASE_URL or SUPABASE_DB_PASSWORD to apply migrations.');
      console.error('Otherwise paste migrations/002_ugc.sql into the Supabase SQL editor.');
      process.exit(2);
    }
    connectionString = `postgres://postgres:${encodeURIComponent(pw)}@db.${ref}.supabase.co:5432/postgres`;
  }

  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log('Connected. Applying', file, '...');
  await client.query(sql);
  console.log('Done.');
  await client.end();
}

main().catch((e) => {
  console.error('Migration failed:', e.message);
  process.exit(1);
});
