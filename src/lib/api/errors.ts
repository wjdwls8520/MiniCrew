function containsEnglish(text: string): boolean {
    return /[A-Za-z]/.test(text);
}

function translateKnownError(message: string): string | null {
    const trimmed = message.trim();

    const missingTableMatch =
        trimmed.match(/Could not find the table 'public\.([a-zA-Z0-9_]+)' in the schema cache/i) ??
        trimmed.match(/relation \"public\.([a-zA-Z0-9_]+)\" does not exist/i);
    if (missingTableMatch) {
        const tableName = missingTableMatch[1];
        return `Supabase에 \`public.${tableName}\` 테이블이 없습니다. \`supabase/schema.sql\`을 SQL Editor에서 먼저 실행해 주세요.`;
    }

    if (/Missing Supabase environment variables/i.test(trimmed)) {
        return '.env.local에 `NEXT_PUBLIC_SUPABASE_URL`과 `NEXT_PUBLIC_SUPABASE_ANON_KEY`를 설정해 주세요.';
    }

    if (/Invalid API key|No API key found/i.test(trimmed)) {
        return 'Supabase API 키가 올바르지 않습니다. `.env.local`의 키 값을 확인해 주세요.';
    }

    if (/Failed to fetch|fetch failed|NetworkError/i.test(trimmed)) {
        return '네트워크 연결이 불안정합니다. 인터넷 연결 또는 Supabase 상태를 확인해 주세요.';
    }

    if (/row-level security|permission denied|not authorized|jwt/i.test(trimmed)) {
        return '권한이 없어 요청을 처리할 수 없습니다. RLS 정책과 인증 상태를 확인해 주세요.';
    }

    if (/duplicate key value violates unique constraint/i.test(trimmed)) {
        return '중복된 데이터가 있어 저장할 수 없습니다.';
    }

    if (/violates foreign key constraint/i.test(trimmed)) {
        return '연결된 데이터가 없어 요청을 처리할 수 없습니다.';
    }

    if (/violates not-null constraint|null value in column/i.test(trimmed)) {
        return '필수 입력값이 누락되었습니다.';
    }

    if (/violates check constraint/i.test(trimmed)) {
        return '입력값이 허용된 조건을 만족하지 않습니다.';
    }

    if (/timeout|timed out/i.test(trimmed)) {
        return '요청 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.';
    }

    return null;
}

function normalizeErrorMessage(message: string, fallback: string): string {
    const translated = translateKnownError(message);
    if (translated) {
        return translated;
    }

    if (!message.trim()) {
        return fallback;
    }

    if (containsEnglish(message)) {
        return fallback;
    }

    return message.trim();
}

export function toErrorMessage(error: unknown, fallback = '요청 처리 중 오류가 발생했습니다.'): string {
    if (error instanceof Error) {
        return normalizeErrorMessage(error.message, fallback);
    }

    if (typeof error === 'object' && error !== null && 'message' in error) {
        const message = String((error as { message?: unknown }).message ?? '');
        return normalizeErrorMessage(message, fallback);
    }

    return fallback;
}
