import { NextResponse } from 'next/server';
import { enforceRateLimit } from '@/lib/server/security';
import { getAuthUserFromRequest } from '@/lib/server/supabaseRoute';

const STORAGE_BUCKET_ID = 'minicrew-media';
const PROFILE_IMAGE_MAX_BYTES = 500 * 1024;
const DEFAULT_IMAGE_MAX_BYTES = 1 * 1024 * 1024;
const ITEM_ATTACHMENT_IMAGE_MAX_BYTES = 500 * 1024;
const ITEM_ATTACHMENT_NON_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
const STORAGE_SOFT_LIMIT_BYTES = Math.floor(0.95 * 1024 * 1024 * 1024);

type UploadFolder = 'profiles' | 'project_items' | 'chat_messages' | 'task_attachments';

interface StorageUsageSummaryRow {
    used_bytes: number | string | null;
    soft_limit_bytes: number | string | null;
    blocked: boolean | null;
}

function normalizeText(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function sanitizeFilenameBase(filename: string): string {
    const withNoExtension = filename.replace(/\.[^/.]+$/, '');
    const normalized = withNoExtension
        .normalize('NFKD')
        .replace(/[^\w.-]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '');

    return normalized.slice(0, 40) || 'image';
}

function toNumber(value: number | string | null | undefined): number {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === 'string') {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) {
            return parsed;
        }
    }
    return 0;
}

function getDateFolder(): string {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function getAllowedFolder(value: string): UploadFolder {
    if (value === 'profiles' || value === 'project_items' || value === 'chat_messages' || value === 'task_attachments') {
        return value;
    }
    throw new Error('허용되지 않은 업로드 경로입니다.');
}

function getMaxBytesByFolder(folder: UploadFolder): number {
    return folder === 'profiles' ? PROFILE_IMAGE_MAX_BYTES : DEFAULT_IMAGE_MAX_BYTES;
}

function getStoredExtension(contentType: string): string {
    if (!contentType) {
        return 'bin';
    }
    if (contentType === 'image/jpeg') {
        return 'jpg';
    }
    if (contentType === 'image/png') {
        return 'png';
    }
    if (contentType === 'image/gif') {
        return 'gif';
    }
    if (contentType === 'image/heic') {
        return 'heic';
    }
    if (contentType === 'image/heif') {
        return 'heif';
    }
    return 'webp';
}

function getOriginalExtension(filename: string): string {
    const match = filename.toLowerCase().match(/\.([a-z0-9]{1,16})$/i);
    return match?.[1] ?? 'bin';
}

function getStorageUsageRow(data: unknown): StorageUsageSummaryRow | null {
    if (Array.isArray(data)) {
        const first = data[0];
        if (first && typeof first === 'object') {
            return first as StorageUsageSummaryRow;
        }
    }

    if (data && typeof data === 'object') {
        return data as StorageUsageSummaryRow;
    }

    return null;
}

async function assertStorageUploadAllowed(supabase: Awaited<ReturnType<typeof getAuthUserFromRequest>>['supabase']): Promise<void> {
    const { data, error } = await supabase.rpc('get_storage_usage_summary');
    if (error) {
        throw new Error('스토리지 사용량 확인에 실패했습니다. 데이터베이스 스키마를 최신 버전으로 다시 적용해 주세요.');
    }

    const row = getStorageUsageRow(data);
    if (!row) {
        throw new Error('스토리지 사용량 정보를 가져오지 못했습니다. 잠시 후 다시 시도해 주세요.');
    }

    const usedBytes = toNumber(row.used_bytes);
    const limitBytes = toNumber(row.soft_limit_bytes) || STORAGE_SOFT_LIMIT_BYTES;
    const blocked = Boolean(row.blocked) || usedBytes >= limitBytes;

    if (blocked) {
        throw new Error('무료 스토리지 사용량이 기준(약 0.95기가바이트)에 도달해 업로드를 차단했습니다.');
    }
}

export async function POST(request: Request) {
    const rateLimitResponse = enforceRateLimit(request, 'storage:upload');
    if (rateLimitResponse) {
        return rateLimitResponse;
    }

    try {
        const { supabase, user } = await getAuthUserFromRequest(request);
        if (!user) {
            return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
        }

        const formData = await request.formData();
        const folder = getAllowedFolder(normalizeText(formData.get('folder')));
        const fileEntry = formData.get('file');

        if (!(fileEntry instanceof File)) {
            return NextResponse.json({ error: '업로드할 파일이 없습니다.' }, { status: 400 });
        }

        const isTaskAttachment = folder === 'task_attachments';
        const isImageUploadFolder = folder !== 'task_attachments';
        const mimeType = normalizeText(fileEntry.type).toLowerCase() || 'application/octet-stream';

        if (!isTaskAttachment && mimeType.startsWith('video/')) {
            return NextResponse.json({ error: '영상 파일은 업로드할 수 없습니다.' }, { status: 400 });
        }

        if (isImageUploadFolder && !mimeType.startsWith('image/')) {
            return NextResponse.json({ error: '이미지 파일만 업로드할 수 있습니다.' }, { status: 400 });
        }

        const maxBytes = isTaskAttachment
            ? (mimeType.startsWith('image/') ? ITEM_ATTACHMENT_IMAGE_MAX_BYTES : ITEM_ATTACHMENT_NON_IMAGE_MAX_BYTES)
            : getMaxBytesByFolder(folder);
        if (fileEntry.size > maxBytes) {
            const limitText = isTaskAttachment
                ? (mimeType.startsWith('image/') ? '500KB' : '10MB')
                : (folder === 'profiles' ? '500KB' : '1MB');
            if (isTaskAttachment) {
                return NextResponse.json({ error: `첨부 파일은 ${limitText} 이하여야 합니다.` }, { status: 400 });
            }
            return NextResponse.json({ error: `이미지 용량은 ${limitText} 이하여야 합니다.` }, { status: 400 });
        }

        await assertStorageUploadAllowed(supabase);

        const storedFilenameBase = sanitizeFilenameBase(fileEntry.name);
        const extension = isTaskAttachment ? getOriginalExtension(fileEntry.name) : getStoredExtension(mimeType);
        const uniqueSuffix = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
        const storedFilename = `${storedFilenameBase}_${uniqueSuffix}.${extension}`;
        const storagePath = `${folder}/${getDateFolder()}/${user.id}/${storedFilename}`;

        const { error: uploadError } = await supabase.storage
            .from(STORAGE_BUCKET_ID)
            .upload(storagePath, fileEntry, {
                cacheControl: '3600',
                upsert: false,
                contentType: mimeType,
            });

        if (uploadError) {
            throw new Error(uploadError.message || '파일 업로드에 실패했습니다.');
        }

        try {
            await assertStorageUploadAllowed(supabase);
        } catch {
            await supabase.storage.from(STORAGE_BUCKET_ID).remove([storagePath]);
            throw new Error('무료 스토리지 사용량이 기준(약 0.95기가바이트)에 도달해 업로드를 차단했습니다.');
        }

        const { data: publicUrlData } = supabase.storage
            .from(STORAGE_BUCKET_ID)
            .getPublicUrl(storagePath);

        return NextResponse.json(
            {
                data: {
                    bucketId: STORAGE_BUCKET_ID,
                    publicUrl: publicUrlData.publicUrl,
                    storagePath,
                    originalFilename: fileEntry.name,
                    storedFilename,
                    sizeBytes: fileEntry.size,
                    mimeType,
                },
            },
            { status: 200 }
        );
    } catch (error) {
        const message = error instanceof Error ? error.message : '파일 업로드에 실패했습니다.';
        return NextResponse.json({ error: message }, { status: 400 });
    }
}
