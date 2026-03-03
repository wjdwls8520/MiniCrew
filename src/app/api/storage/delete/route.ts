import { NextResponse } from 'next/server';
import { enforceRateLimit } from '@/lib/server/security';
import { getAuthUserFromRequest } from '@/lib/server/supabaseRoute';

const STORAGE_BUCKET_ID = 'minicrew-media';

function normalizeText(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function isStorageNotFoundMessage(message: string): boolean {
    return /not found|no such file|does not exist|404/i.test(message);
}

export async function POST(request: Request) {
    const rateLimitResponse = enforceRateLimit(request, 'storage:delete');
    if (rateLimitResponse) {
        return rateLimitResponse;
    }

    try {
        const { supabase, user } = await getAuthUserFromRequest(request);
        if (!user) {
            return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
        }

        const body = (await request.json()) as { storagePath?: unknown };
        const storagePath = normalizeText(body.storagePath);
        if (!storagePath) {
            return NextResponse.json({ data: { success: true } }, { status: 200 });
        }

        const { error } = await supabase.storage.from(STORAGE_BUCKET_ID).remove([storagePath]);
        if (error && !isStorageNotFoundMessage(error.message || '')) {
            throw new Error(error.message || '스토리지 파일 삭제에 실패했습니다.');
        }

        return NextResponse.json({ data: { success: true } }, { status: 200 });
    } catch (error) {
        const message = error instanceof Error ? error.message : '스토리지 파일 삭제에 실패했습니다.';
        return NextResponse.json({ error: message }, { status: 400 });
    }
}

