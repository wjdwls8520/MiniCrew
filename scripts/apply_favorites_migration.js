const { readFileSync } = require('fs');
const { Client } = require('pg');

const connectionString = 'postgresql://postgres.iuoulihghagqfjirvmru:MiniclewDB2026!@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres';

async function main() {
    const sql = readFileSync('./supabase/migrations/20260304_per_user_favorites.sql', 'utf-8');
    const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
    await client.connect();
    console.log('Connected. Applying migration...');
    await client.query(sql);
    console.log('Migration applied successfully!');
    await client.end();
}

main().catch((err) => { console.error('Error:', err.message); process.exit(1); });
