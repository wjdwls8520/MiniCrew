import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { createClient } from '@supabase/supabase-js';

const REQUIRED_TABLES = [
    'projects',
    'user_profiles',
    'project_members',
    'project_items',
    'project_item_assignees',
    'project_invitations',
    'project_join_requests',
];

function parseProjectRef(url) {
    const trimmed = typeof url === 'string' ? url.trim() : '';
    if (!trimmed) {
        return '';
    }

    try {
        const hostname = new URL(trimmed).hostname;
        const [subdomain] = hostname.split('.');
        return subdomain ?? '';
    } catch {
        return '';
    }
}

async function tableExists(supabase, tableName) {
    const { error } = await supabase
        .from(tableName)
        .select('id', { head: true, count: 'exact' })
        .limit(1);

    if (!error) {
        return true;
    }

    const message = String(error.message ?? '');

    if (/Could not find the table|does not exist/i.test(message)) {
        return false;
    }

    if (/row-level security|permission denied|not authorized/i.test(message)) {
        return true;
    }

    throw new Error(`[${tableName}] 확인 실패: ${message}`);
}

async function applySchemaViaManagementApi({ projectRef, accessToken, schemaSql }) {
    const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: schemaSql }),
    });

    if (!response.ok) {
        const bodyText = await response.text();
        throw new Error(`Management API 호출 실패(${response.status}): ${bodyText}`);
    }
}

async function ensureSchema() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? '';
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? '';

    if (!supabaseUrl || !supabaseAnonKey) {
        console.warn('[db:ensure] Supabase URL/Anon Key가 없어 자동 스키마 생성을 건너뜁니다.');
        return;
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
    });

    const missingTables = [];

    for (const tableName of REQUIRED_TABLES) {
        const exists = await tableExists(supabase, tableName);
        if (!exists) {
            missingTables.push(tableName);
        }
    }

    if (missingTables.length === 0) {
        console.log('[db:ensure] 필수 테이블이 이미 존재합니다.');
        return;
    }

    console.log(`[db:ensure] 누락 테이블 감지: ${missingTables.join(', ')}`);

    const accessToken = process.env.SUPABASE_ACCESS_TOKEN?.trim() ?? '';
    const projectRef = process.env.SUPABASE_PROJECT_REF?.trim() || parseProjectRef(supabaseUrl);

    if (!accessToken || !projectRef) {
        throw new Error(
            '자동 스키마 적용을 위해 SUPABASE_ACCESS_TOKEN 및 SUPABASE_PROJECT_REF(또는 URL 파싱 가능 URL)가 필요합니다. '
            + '없다면 Supabase SQL Editor에서 supabase/schema.sql을 수동 실행해 주세요.'
        );
    }

    const schemaPath = path.join(process.cwd(), 'supabase', 'schema.sql');
    const schemaSql = await fs.readFile(schemaPath, 'utf8');

    console.log('[db:ensure] Management API를 통해 supabase/schema.sql을 적용합니다...');
    await applySchemaViaManagementApi({ projectRef, accessToken, schemaSql });

    const missingAfterApply = [];

    for (const tableName of REQUIRED_TABLES) {
        const exists = await tableExists(supabase, tableName);
        if (!exists) {
            missingAfterApply.push(tableName);
        }
    }

    if (missingAfterApply.length > 0) {
        throw new Error(`스키마 적용 후에도 누락된 테이블이 있습니다: ${missingAfterApply.join(', ')}`);
    }

    console.log('[db:ensure] 스키마 적용이 완료되었습니다.');
}

ensureSchema().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[db:ensure] 자동 스키마 적용 실패:', message);
    process.exit(1);
});
