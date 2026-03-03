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

    const missingRelationMatch = trimmed.match(/relation \"([a-zA-Z0-9_]+)\" does not exist/i);
    if (missingRelationMatch) {
        const relationName = missingRelationMatch[1];
        return `Supabase에 \`public.${relationName}\` 테이블이 없습니다. \`supabase/schema.sql\`을 SQL Editor에서 먼저 실행해 주세요.`;
    }

    if (
        /chat_rooms\.room_type/i.test(trimmed) ||
        /chat_rooms\.direct_key/i.test(trimmed) ||
        /chat_room_members/i.test(trimmed) ||
        /is_chat_room_member/i.test(trimmed)
    ) {
        return '채팅 스키마가 최신이 아닙니다. `supabase/schema.sql`을 다시 실행해 채팅 관련 테이블과 컬럼을 생성해 주세요.';
    }

    if (
        /project_item_comments/i.test(trimmed) ||
        /projects\.status/i.test(trimmed)
    ) {
        return '프로젝트 보드 스키마가 최신이 아닙니다. `supabase/schema.sql`을 다시 실행해 댓글/상태 관련 테이블과 컬럼을 생성해 주세요.';
    }

    if (
        /image_url/i.test(trimmed) ||
        /image_original_filename/i.test(trimmed) ||
        /image_stored_filename/i.test(trimmed) ||
        /avatar_original_filename/i.test(trimmed) ||
        /get_storage_usage_summary/i.test(trimmed) ||
        /storage\.objects/i.test(trimmed) ||
        /minicrew-media/i.test(trimmed)
    ) {
        return '이미지/스토리지 스키마가 최신이 아닙니다. `supabase/schema.sql`을 SQL Editor에서 다시 실행해 주세요.';
    }

    if (
        /project_item_attachments_file_size_bytes_check/i.test(trimmed) ||
        (/project_item_attachments/i.test(trimmed) && /file_size_bytes/i.test(trimmed) && /check constraint/i.test(trimmed))
    ) {
        return '첨부 파일 스키마가 구버전입니다. `project_item_attachments.file_size_bytes` 제한을 10MB로 변경해 주세요.';
    }

    if (
        /project_item_attachments_mime_type_check/i.test(trimmed) ||
        (/project_item_attachments/i.test(trimmed) && /mime_type/i.test(trimmed) && /check constraint/i.test(trimmed))
    ) {
        return '첨부 파일 스키마가 구버전입니다. `project_item_attachments.mime_type` 제한을 최신 스키마로 변경해 주세요.';
    }

    if (
        /permission denied for table project_items/i.test(trimmed) ||
        /permission denied for table project_item_attachments/i.test(trimmed)
    ) {
        return '`service_role` DB 권한이 부족합니다. `project_items/project_item_attachments` 테이블 권한을 확인해 주세요.';
    }

    if (/exceeded the maximum allowed size|payload too large|entity too large/i.test(trimmed)) {
        return '스토리지 파일 용량 제한에 걸렸습니다. `minicrew-media` 버킷의 `file_size_limit`을 10MB로 설정해 주세요.';
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

    if (/ANOMALY_BLOCKED|이상징후/i.test(trimmed)) {
        return '한번에 많은 이상징후가 감지되어 작업을 정지합니다.';
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
