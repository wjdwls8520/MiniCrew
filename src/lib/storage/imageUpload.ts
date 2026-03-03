import { requestApi } from '@/lib/api/client';

export const PROFILE_IMAGE_MAX_BYTES = 500 * 1024;
export const BOARD_IMAGE_MAX_BYTES = 500 * 1024;
export const DEFAULT_IMAGE_MAX_BYTES = 1 * 1024 * 1024;
export const ITEM_ATTACHMENT_NON_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export const ITEM_ATTACHMENT_MAX_COUNT = 5;

const MAX_IMAGE_DIMENSION = 1920;
const MIN_IMAGE_DIMENSION = 640;
const MIN_WEBP_QUALITY = 0.58;
const STORAGE_DELETE_MAX_RETRY = 3;
const STORAGE_DELETE_RETRY_DELAY_MS = 220;
const PENDING_STORAGE_DELETE_KEY = 'minicrew_pending_storage_deletions_v1';
const PENDING_STORAGE_DELETE_LIMIT = 400;

let isFlushingPendingDeletions = false;

export interface UploadedImageAsset {
    bucketId: string;
    publicUrl: string;
    storagePath: string;
    originalFilename: string;
    storedFilename: string;
    sizeBytes: number;
    wasCompressed: boolean;
    warnQualityLoss: boolean;
}

export interface UploadedFileAsset {
    bucketId: string;
    publicUrl: string;
    storagePath: string;
    originalFilename: string;
    storedFilename: string;
    sizeBytes: number;
    mimeType: string;
    wasCompressed: boolean;
    warnQualityLoss: boolean;
}

interface UploadOptimizedImageInput {
    file: File;
    userId: string;
    folder: 'profiles' | 'project_items' | 'chat_messages' | 'task_attachments';
}

function getImageMaxBytesByFolder(folder: UploadOptimizedImageInput['folder']): number {
    if (folder === 'profiles') {
        return PROFILE_IMAGE_MAX_BYTES;
    }

    if (folder === 'project_items' || folder === 'task_attachments') {
        return BOARD_IMAGE_MAX_BYTES;
    }

    return DEFAULT_IMAGE_MAX_BYTES;
}

function toKoreanSizeLabel(bytes: number): string {
    if (bytes >= 1024 * 1024) {
        return `${Math.round(bytes / (1024 * 1024))}메가바이트`;
    }

    return `${Math.round(bytes / 1024)}킬로바이트`;
}

function blobToFile(blob: Blob, filename: string): File {
    return new File([blob], filename, { type: blob.type || 'image/webp' });
}

function wait(ms: number): Promise<void> {
    return new Promise((resolve) => {
        window.setTimeout(resolve, ms);
    });
}

function normalizeStoragePath(storagePath?: string | null): string | null {
    const normalized = storagePath?.trim();
    return normalized ? normalized : null;
}

function readPendingStorageDeletionQueue(): string[] {
    if (typeof window === 'undefined') {
        return [];
    }

    const raw = window.localStorage.getItem(PENDING_STORAGE_DELETE_KEY);
    if (!raw) {
        return [];
    }

    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
            return [];
        }

        return parsed
            .map((value) => (typeof value === 'string' ? value.trim() : ''))
            .filter(Boolean);
    } catch {
        return [];
    }
}

function writePendingStorageDeletionQueue(paths: string[]): void {
    if (typeof window === 'undefined') {
        return;
    }

    const normalized = Array.from(new Set(paths.map((path) => path.trim()).filter(Boolean)));
    const limited = normalized.slice(-PENDING_STORAGE_DELETE_LIMIT);
    window.localStorage.setItem(PENDING_STORAGE_DELETE_KEY, JSON.stringify(limited));
}

function enqueuePendingStorageDeletion(storagePath?: string | null): void {
    const normalizedPath = normalizeStoragePath(storagePath);
    if (!normalizedPath || typeof window === 'undefined') {
        return;
    }

    const queue = readPendingStorageDeletionQueue();
    queue.push(normalizedPath);
    writePendingStorageDeletionQueue(queue);
}

function isStorageNotFoundMessage(message: string): boolean {
    return /not found|no such file|does not exist|404/i.test(message);
}

async function removeStoragePathOnce(storagePath: string): Promise<boolean> {
    try {
        await requestApi<{ success: boolean }>({
            path: '/api/storage/delete',
            method: 'POST',
            apiKey: 'storage:delete',
            requireAuth: true,
            payload: { storagePath },
        });
        return true;
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error ?? '');
        if (isStorageNotFoundMessage(message)) {
            return true;
        }
        return false;
    }
}

async function removeStoragePathWithRetry(storagePath: string): Promise<boolean> {
    for (let attempt = 0; attempt < STORAGE_DELETE_MAX_RETRY; attempt += 1) {
        const ok = await removeStoragePathOnce(storagePath);
        if (ok) {
            return true;
        }

        if (attempt < STORAGE_DELETE_MAX_RETRY - 1) {
            await wait(STORAGE_DELETE_RETRY_DELAY_MS * (attempt + 1));
        }
    }

    return false;
}

export async function flushPendingStorageDeletions(maxItems = 40): Promise<number> {
    if (typeof window === 'undefined' || isFlushingPendingDeletions) {
        return 0;
    }

    isFlushingPendingDeletions = true;

    try {
        const queue = readPendingStorageDeletionQueue();
        if (queue.length === 0) {
            return 0;
        }

        const toProcess = queue.slice(0, Math.max(1, Math.min(maxItems, queue.length)));
        const remaining = queue.slice(toProcess.length);
        const failed: string[] = [];
        let removedCount = 0;

        for (const path of toProcess) {
            const ok = await removeStoragePathWithRetry(path);
            if (ok) {
                removedCount += 1;
            } else {
                failed.push(path);
            }

            await wait(360);
        }

        writePendingStorageDeletionQueue([...failed, ...remaining]);
        return removedCount;
    } finally {
        isFlushingPendingDeletions = false;
    }
}

function readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            if (typeof reader.result === 'string') {
                resolve(reader.result);
                return;
            }
            reject(new Error('이미지 파일을 읽지 못했습니다.'));
        };
        reader.onerror = () => reject(new Error('이미지 파일을 읽지 못했습니다.'));
        reader.readAsDataURL(file);
    });
}

function createImageElement(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('이미지 디코딩에 실패했습니다.'));
        image.src = src;
    });
}

function canvasToWebpBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
    return new Promise((resolve, reject) => {
        canvas.toBlob(
            (blob) => {
                if (!blob) {
                    reject(new Error('이미지 변환에 실패했습니다.'));
                    return;
                }
                resolve(blob);
            },
            'image/webp',
            quality
        );
    });
}

export async function optimizeImageForUpload(file: File, maxBytes = DEFAULT_IMAGE_MAX_BYTES): Promise<{
    optimizedFile: File;
    wasCompressed: boolean;
    warnQualityLoss: boolean;
}> {
    if (file.type.startsWith('video/')) {
        throw new Error('영상 파일은 업로드할 수 없습니다.');
    }

    if (!file.type.startsWith('image/')) {
        throw new Error('이미지 파일만 업로드할 수 있습니다.');
    }

    const shouldWarnQualityLoss = file.size > maxBytes;
    const dataUrl = await readFileAsDataUrl(file);
    const image = await createImageElement(dataUrl);
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    if (!context) {
        throw new Error('이미지 처리 컨텍스트를 생성하지 못했습니다.');
    }

    const maxSourceDimension = Math.max(image.width, image.height, 1);
    const initialScale = maxSourceDimension > MAX_IMAGE_DIMENSION ? MAX_IMAGE_DIMENSION / maxSourceDimension : 1;

    let currentWidth = Math.max(1, Math.floor(image.width * initialScale));
    let currentHeight = Math.max(1, Math.floor(image.height * initialScale));
    let currentQuality = 0.92;
    let optimizedBlob: Blob | null = null;

    for (let attempt = 0; attempt < 20; attempt += 1) {
        canvas.width = currentWidth;
        canvas.height = currentHeight;
        context.clearRect(0, 0, currentWidth, currentHeight);
        context.drawImage(image, 0, 0, currentWidth, currentHeight);

        optimizedBlob = await canvasToWebpBlob(canvas, currentQuality);
        if (optimizedBlob.size <= maxBytes) {
            break;
        }

        if (currentQuality > MIN_WEBP_QUALITY) {
            currentQuality = Math.max(MIN_WEBP_QUALITY, currentQuality - 0.08);
            continue;
        }

        if (Math.min(currentWidth, currentHeight) <= MIN_IMAGE_DIMENSION) {
            break;
        }

        currentWidth = Math.max(MIN_IMAGE_DIMENSION, Math.floor(currentWidth * 0.88));
        currentHeight = Math.max(MIN_IMAGE_DIMENSION, Math.floor(currentHeight * 0.88));
        currentQuality = 0.9;
    }

    if (!optimizedBlob) {
        throw new Error('이미지 최적화에 실패했습니다.');
    }

    if (optimizedBlob.size > maxBytes) {
        throw new Error(`이미지를 ${toKoreanSizeLabel(maxBytes)} 이하로 최적화하지 못했습니다. 더 작은 이미지를 업로드해 주세요.`);
    }

    const optimizedFile = blobToFile(optimizedBlob, file.name.replace(/\.[^/.]+$/, '') + '.webp');
    return {
        optimizedFile,
        wasCompressed: optimizedBlob.size < file.size || shouldWarnQualityLoss,
        warnQualityLoss: shouldWarnQualityLoss,
    };
}

export async function uploadOptimizedImage(input: UploadOptimizedImageInput): Promise<UploadedImageAsset> {
    const userId = input.userId.trim();
    if (!userId) {
        throw new Error('로그인 정보가 없어 이미지를 업로드할 수 없습니다.');
    }

    void flushPendingStorageDeletions(10);
    const maxBytes = getImageMaxBytesByFolder(input.folder);
    const optimized = await optimizeImageForUpload(input.file, maxBytes);

    const formData = new FormData();
    formData.append('folder', input.folder);
    formData.append('file', optimized.optimizedFile, optimized.optimizedFile.name);

    const uploaded = await requestApi<{
        bucketId: string;
        publicUrl: string;
        storagePath: string;
        originalFilename: string;
        storedFilename: string;
        sizeBytes: number;
        mimeType?: string;
    }>({
        path: '/api/storage/upload',
        method: 'POST',
        formData,
        requireAuth: true,
        apiKey: `storage:upload:${input.folder}`,
    });

    return {
        bucketId: uploaded.bucketId,
        publicUrl: uploaded.publicUrl,
        storagePath: uploaded.storagePath,
        originalFilename: uploaded.originalFilename,
        storedFilename: uploaded.storedFilename,
        sizeBytes: uploaded.sizeBytes,
        wasCompressed: optimized.wasCompressed,
        warnQualityLoss: optimized.warnQualityLoss,
    };
}

async function uploadFileDirect(input: {
    file: File;
    folder: 'profiles' | 'project_items' | 'chat_messages' | 'task_attachments';
}): Promise<{
    bucketId: string;
    publicUrl: string;
    storagePath: string;
    originalFilename: string;
    storedFilename: string;
    sizeBytes: number;
    mimeType: string;
}> {
    const formData = new FormData();
    formData.append('folder', input.folder);
    formData.append('file', input.file, input.file.name);

    return requestApi<{
        bucketId: string;
        publicUrl: string;
        storagePath: string;
        originalFilename: string;
        storedFilename: string;
        sizeBytes: number;
        mimeType: string;
    }>({
        path: '/api/storage/upload',
        method: 'POST',
        formData,
        requireAuth: true,
        apiKey: `storage:upload:${input.folder}`,
    });
}

export async function uploadTaskAttachment(input: {
    file: File;
    userId: string;
}): Promise<UploadedFileAsset> {
    const userId = input.userId.trim();
    if (!userId) {
        throw new Error('로그인 정보가 없어 첨부 파일을 업로드할 수 없습니다.');
    }

    const file = input.file;
    const isImage = file.type.startsWith('image/');
    if (!isImage && file.size > ITEM_ATTACHMENT_NON_IMAGE_MAX_BYTES) {
        throw new Error('이미지 외 파일은 10MB 이하여야 합니다.');
    }

    void flushPendingStorageDeletions(10);

    if (isImage) {
        if (file.size > BOARD_IMAGE_MAX_BYTES) {
            const optimized = await optimizeImageForUpload(file, BOARD_IMAGE_MAX_BYTES);
            const uploaded = await uploadFileDirect({
                file: optimized.optimizedFile,
                folder: 'task_attachments',
            });

            return {
                bucketId: uploaded.bucketId,
                publicUrl: uploaded.publicUrl,
                storagePath: uploaded.storagePath,
                originalFilename: uploaded.originalFilename,
                storedFilename: uploaded.storedFilename,
                sizeBytes: uploaded.sizeBytes,
                mimeType: uploaded.mimeType,
                wasCompressed: optimized.wasCompressed,
                warnQualityLoss: optimized.warnQualityLoss,
            };
        }

        const uploaded = await uploadFileDirect({
            file,
            folder: 'task_attachments',
        });
        return {
            bucketId: uploaded.bucketId,
            publicUrl: uploaded.publicUrl,
            storagePath: uploaded.storagePath,
            originalFilename: uploaded.originalFilename,
            storedFilename: uploaded.storedFilename,
            sizeBytes: uploaded.sizeBytes,
            mimeType: uploaded.mimeType,
            wasCompressed: false,
            warnQualityLoss: false,
        };
    }

    const uploaded = await uploadFileDirect({
        file,
        folder: 'task_attachments',
    });
    return {
        bucketId: uploaded.bucketId,
        publicUrl: uploaded.publicUrl,
        storagePath: uploaded.storagePath,
        originalFilename: uploaded.originalFilename,
        storedFilename: uploaded.storedFilename,
        sizeBytes: uploaded.sizeBytes,
        mimeType: uploaded.mimeType,
        wasCompressed: false,
        warnQualityLoss: false,
    };
}

export async function removeStoredImageByPath(storagePath?: string | null): Promise<void> {
    const normalizedPath = normalizeStoragePath(storagePath);
    if (!normalizedPath) {
        return;
    }

    const removed = await removeStoragePathWithRetry(normalizedPath);
    if (removed) {
        return;
    }

    enqueuePendingStorageDeletion(normalizedPath);
    throw new Error('스토리지 파일 삭제에 실패했습니다. 네트워크가 복구되면 자동으로 재시도합니다.');
}

export async function cleanupStoredImagePathSafely(storagePath?: string | null): Promise<boolean> {
    const normalizedPath = normalizeStoragePath(storagePath);
    if (!normalizedPath) {
        return true;
    }

    const removed = await removeStoragePathWithRetry(normalizedPath);
    if (removed) {
        return true;
    }

    enqueuePendingStorageDeletion(normalizedPath);
    return false;
}
