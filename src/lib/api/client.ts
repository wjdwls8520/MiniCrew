'use client';

import { supabase } from '@/lib/supabase';

export const ANOMALY_BLOCK_MESSAGE = '한번에 많은 이상징후가 감지되어 작업을 정지합니다.';

const CLIENT_READ_API_LIMIT_PER_SEC = 24;
const CLIENT_WRITE_API_LIMIT_PER_SEC = 12;
const CLIENT_GLOBAL_LIMIT_PER_SEC = 80;
const CLIENT_BLOCK_DURATION_MS = 3_000;
const CLIENT_ALERT_COOLDOWN_MS = 2_000;
const CLIENT_BOOTSTRAP_GRACE_MS = 1_800;
const REQUEST_TIMEOUT_MS = 20_000;

const READ_API_KEY_REGEX = /(list|get|has|count|search|recent|access|profile)/i;
const WRITE_API_KEY_REGEX = /(create|update|delete|remove|mark|respond|review|transfer|upload|add|send|upsert|toggle)/i;

const perApiTimeline = new Map<string, number[]>();
const blockedUntilByApi = new Map<string, number>();
const activeControllersByApi = new Map<string, Set<AbortController>>();
const inFlightReadRequests = new Map<string, Promise<unknown>>();

let globalTimeline: number[] = [];
let lastAlertAt = 0;
const clientStartedAt = Date.now();

export class AnomalyBlockedError extends Error {
    readonly code = 'ANOMALY_BLOCKED';

    constructor(message = ANOMALY_BLOCK_MESSAGE) {
        super(message);
        this.name = 'AnomalyBlockedError';
    }
}

export function isAnomalyBlockedError(error: unknown): error is AnomalyBlockedError {
    if (!error || typeof error !== 'object') {
        return false;
    }

    const maybeError = error as { name?: unknown; code?: unknown; message?: unknown };
    if (maybeError.name === 'AnomalyBlockedError') {
        return true;
    }
    if (maybeError.code === 'ANOMALY_BLOCKED') {
        return true;
    }
    if (typeof maybeError.message === 'string' && maybeError.message.includes(ANOMALY_BLOCK_MESSAGE)) {
        return true;
    }
    return false;
}

function toNow(): number {
    return Date.now();
}

function pruneTimeline(timeline: number[], now: number): number[] {
    return timeline.filter((timestamp) => now - timestamp < 1000);
}

function appendTimeline(target: number[], now: number): number[] {
    const next = pruneTimeline(target, now);
    next.push(now);
    return next;
}

function isWriteApiKey(apiKey: string): boolean {
    return WRITE_API_KEY_REGEX.test(apiKey);
}

function isReadApiKey(apiKey: string): boolean {
    if (isWriteApiKey(apiKey)) {
        return false;
    }
    return READ_API_KEY_REGEX.test(apiKey);
}

function getPerApiLimit(apiKey: string): number {
    if (isWriteApiKey(apiKey)) {
        return CLIENT_WRITE_API_LIMIT_PER_SEC;
    }
    return CLIENT_READ_API_LIMIT_PER_SEC;
}

function showAnomalyAlert(): void {
    if (typeof window === 'undefined') {
        return;
    }

    const now = toNow();
    if (now - lastAlertAt < CLIENT_ALERT_COOLDOWN_MS) {
        return;
    }

    lastAlertAt = now;
    window.alert(ANOMALY_BLOCK_MESSAGE);
}

function getControllerBucket(apiKey: string): Set<AbortController> {
    const existing = activeControllersByApi.get(apiKey);
    if (existing) {
        return existing;
    }
    const next = new Set<AbortController>();
    activeControllersByApi.set(apiKey, next);
    return next;
}

function registerController(apiKey: string, controller: AbortController): void {
    const bucket = getControllerBucket(apiKey);
    bucket.add(controller);
}

function unregisterController(apiKey: string, controller: AbortController): void {
    const bucket = activeControllersByApi.get(apiKey);
    if (!bucket) {
        return;
    }
    bucket.delete(controller);
    if (bucket.size === 0) {
        activeControllersByApi.delete(apiKey);
    }
}

function abortPendingRequestsByApi(apiKey: string, reason: string): void {
    const bucket = activeControllersByApi.get(apiKey);
    if (!bucket || bucket.size === 0) {
        return;
    }
    bucket.forEach((controller) => {
        controller.abort(reason);
    });
    activeControllersByApi.delete(apiKey);
}

function cleanupExpiredBlocks(now: number): void {
    blockedUntilByApi.forEach((blockedUntil, apiKey) => {
        if (blockedUntil <= now) {
            blockedUntilByApi.delete(apiKey);
        }
    });
}

function blockApiKey(apiKey: string, now: number): never {
    blockedUntilByApi.set(apiKey, now + CLIENT_BLOCK_DURATION_MS);
    showAnomalyAlert();
    abortPendingRequestsByApi(apiKey, ANOMALY_BLOCK_MESSAGE);
    throw new AnomalyBlockedError();
}

function enforceClientRateLimit(apiKey: string): void {
    if (typeof window === 'undefined') {
        return;
    }

    const now = toNow();
    cleanupExpiredBlocks(now);

    const isReadKey = isReadApiKey(apiKey);
    if (isReadKey && now - clientStartedAt < CLIENT_BOOTSTRAP_GRACE_MS) {
        return;
    }

    const blockedUntil = blockedUntilByApi.get(apiKey) ?? 0;
    if (blockedUntil > now) {
        showAnomalyAlert();
        abortPendingRequestsByApi(apiKey, ANOMALY_BLOCK_MESSAGE);
        throw new AnomalyBlockedError();
    }

    globalTimeline = appendTimeline(globalTimeline, now);
    if (globalTimeline.length > CLIENT_GLOBAL_LIMIT_PER_SEC) {
        blockApiKey(apiKey, now);
    }

    const currentApiTimeline = perApiTimeline.get(apiKey) ?? [];
    const nextApiTimeline = appendTimeline(currentApiTimeline, now);
    perApiTimeline.set(apiKey, nextApiTimeline);

    if (nextApiTimeline.length > getPerApiLimit(apiKey)) {
        blockApiKey(apiKey, now);
    }
}

function sanitizeString(value: string): string {
    return value
        .replace(/<\s*script[^>]*>[\s\S]*?<\s*\/\s*script\s*>/gi, '')
        .replace(/\son[a-z]+\s*=\s*(['"]).*?\1/gi, '')
        .replace(/javascript:/gi, '')
        .trim();
}

function sanitizePayload<T>(value: T): T {
    if (typeof value === 'string') {
        return sanitizeString(value) as unknown as T;
    }

    if (Array.isArray(value)) {
        return value.map((item) => sanitizePayload(item)) as unknown as T;
    }

    if (value && typeof value === 'object') {
        const next: Record<string, unknown> = {};
        Object.entries(value as Record<string, unknown>).forEach(([key, entryValue]) => {
            next[key] = sanitizePayload(entryValue);
        });
        return next as unknown as T;
    }

    return value;
}

async function getAccessToken(requireAuth: boolean): Promise<string | null> {
    const { data, error } = await supabase.auth.getSession();
    if (error) {
        if (requireAuth) {
            throw new Error('로그인 정보를 확인하지 못했습니다. 다시 로그인해 주세요.');
        }
        return null;
    }

    const accessToken = data.session?.access_token ?? null;
    if (requireAuth && !accessToken) {
        throw new Error('로그인이 필요합니다.');
    }

    return accessToken;
}

function buildRequestInit(
    input: {
        method: string;
        accessToken: string | null;
        payload?: unknown;
        formData?: FormData;
    },
    controller: AbortController
): RequestInit {
    const headers: HeadersInit = {};
    if (input.accessToken) {
        headers.Authorization = `Bearer ${input.accessToken}`;
    }

    if (input.formData) {
        return {
            method: input.method,
            headers,
            body: input.formData,
            signal: controller.signal,
        };
    }

    headers['Content-Type'] = 'application/json';
    return {
        method: input.method,
        headers,
        body: JSON.stringify(input.payload ?? {}),
        signal: controller.signal,
    };
}

async function parseApiResponse<T>(response: Response, apiKey: string): Promise<T> {
    let parsed: { data?: T; error?: string; code?: string } | null = null;

    try {
        parsed = await response.json();
    } catch {
        parsed = null;
    }

    if (!response.ok) {
        const message = parsed?.error?.trim() || '요청 처리 중 오류가 발생했습니다.';

        if (response.status === 429 || parsed?.code === 'ANOMALY_BLOCKED') {
            blockedUntilByApi.set(apiKey, toNow() + CLIENT_BLOCK_DURATION_MS);
            showAnomalyAlert();
            abortPendingRequestsByApi(apiKey, ANOMALY_BLOCK_MESSAGE);
            throw new AnomalyBlockedError();
        }

        throw new Error(message);
    }

    return (parsed?.data as T) ?? (null as T);
}

function normalizeText(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function resolveRateLimitResourceSegment(payload?: unknown): string {
    if (!payload || typeof payload !== 'object') {
        return '';
    }

    const record = payload as Record<string, unknown>;
    const keys = [
        'projectId',
        'roomId',
        'itemId',
        'notificationId',
        'requestId',
        'invitationId',
        'memberId',
        'targetUserId',
        'userId',
    ];

    for (const key of keys) {
        const value = normalizeText(record[key]);
        if (value) {
            return value.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
        }
    }

    return '';
}

export async function requestApi<T>(params: {
    path: string;
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    payload?: unknown;
    formData?: FormData;
    apiKey: string;
    requireAuth?: boolean;
    timeoutMs?: number;
}): Promise<T> {
    const {
        path,
        method = 'POST',
        payload,
        formData,
        apiKey,
        requireAuth = false,
        timeoutMs = REQUEST_TIMEOUT_MS,
    } = params;

    const sanitizedPayload = formData ? undefined : sanitizePayload(payload ?? {});
    const dedupeEligible = !formData && isReadApiKey(apiKey);
    const dedupeKey = dedupeEligible
        ? `${method}:${path}:${apiKey}:${JSON.stringify(sanitizedPayload ?? {})}`
        : '';

    if (dedupeEligible && dedupeKey) {
        const existing = inFlightReadRequests.get(dedupeKey);
        if (existing) {
            return existing as Promise<T>;
        }
    }

    const execute = async (): Promise<T> => {
        enforceClientRateLimit(apiKey);
        const accessToken = await getAccessToken(requireAuth);

        const controller = new AbortController();
        registerController(apiKey, controller);

        const timeoutId = window.setTimeout(() => {
            controller.abort('timeout');
        }, timeoutMs);

        try {
            const response = await fetch(
                path,
                buildRequestInit(
                    {
                        method,
                        accessToken,
                        payload: sanitizedPayload,
                        formData,
                    },
                    controller
                )
            );

            return await parseApiResponse<T>(response, apiKey);
        } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') {
                const blockedUntil = blockedUntilByApi.get(apiKey) ?? 0;
                if (blockedUntil > toNow()) {
                    throw new AnomalyBlockedError();
                }
                throw new Error('요청이 중단되었습니다. 잠시 후 다시 시도해 주세요.');
            }
            throw error;
        } finally {
            window.clearTimeout(timeoutId);
            unregisterController(apiKey, controller);
        }
    };

    const pending = execute();
    if (dedupeEligible && dedupeKey) {
        inFlightReadRequests.set(dedupeKey, pending);
        pending.finally(() => {
            inFlightReadRequests.delete(dedupeKey);
        });
    }
    return pending;
}

export async function callBff<T>(params: {
    action: string;
    payload?: unknown;
    requireAuth?: boolean;
    timeoutMs?: number;
}): Promise<T> {
    const resourceSegment = resolveRateLimitResourceSegment(params.payload);
    const apiKey = resourceSegment
        ? `bff:${params.action}:r:${resourceSegment}`
        : `bff:${params.action}`;

    return requestApi<T>({
        path: '/api/bff',
        method: 'POST',
        apiKey,
        requireAuth: params.requireAuth ?? false,
        timeoutMs: params.timeoutMs,
        payload: {
            action: params.action,
            payload: params.payload ?? {},
        },
    });
}
