import { NextResponse } from 'next/server';

export const ANOMALY_BLOCK_MESSAGE = '한번에 많은 이상징후가 감지되어 작업을 정지합니다.';

const SAME_API_READ_LIMIT_PER_SEC = 24;
const SAME_API_WRITE_LIMIT_PER_SEC = 12;
const GLOBAL_LIMIT_PER_SEC = 80;
const BLOCK_DURATION_MS = 3_000;
const STALE_ENTRY_MAX_AGE_MS = 60_000;
const MAX_TRACKED_IPS = 5000;

const READ_API_KEY_REGEX = /(list|get|has|count|search|recent|access|profile)/i;
const WRITE_API_KEY_REGEX = /(create|update|delete|remove|mark|respond|review|transfer|upload|add|send|upsert|toggle)/i;

interface RateState {
    lastSeenAt: number;
    blockedUntilByApi: Map<string, number>;
    timelineByApi: Map<string, number[]>;
    globalTimeline: number[];
}

const rateStateByIp = new Map<string, RateState>();

function now(): number {
    return Date.now();
}

function pruneTimeline(timeline: number[], currentTime: number): number[] {
    return timeline.filter((timestamp) => currentTime - timestamp < 1000);
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

function getSameApiLimit(apiKey: string): number {
    if (isWriteApiKey(apiKey)) {
        return SAME_API_WRITE_LIMIT_PER_SEC;
    }
    if (isReadApiKey(apiKey)) {
        return SAME_API_READ_LIMIT_PER_SEC;
    }
    return SAME_API_READ_LIMIT_PER_SEC;
}

function cleanupStaleRateStates(currentTime: number): void {
    if (rateStateByIp.size <= MAX_TRACKED_IPS) {
        return;
    }

    const staleIps: string[] = [];
    rateStateByIp.forEach((state, ip) => {
        if (currentTime - state.lastSeenAt > STALE_ENTRY_MAX_AGE_MS) {
            staleIps.push(ip);
        }
    });

    staleIps.forEach((ip) => {
        rateStateByIp.delete(ip);
    });
}

export function getClientIp(request: Request): string {
    const xForwardedFor = request.headers.get('x-forwarded-for')?.trim();
    if (xForwardedFor) {
        return xForwardedFor.split(',')[0].trim() || 'unknown';
    }

    const realIp = request.headers.get('x-real-ip')?.trim();
    if (realIp) {
        return realIp;
    }

    return 'unknown';
}

function getOrCreateRateState(ip: string): RateState {
    const current = rateStateByIp.get(ip);
    if (current) {
        return current;
    }

    const next: RateState = {
        lastSeenAt: now(),
        blockedUntilByApi: new Map<string, number>(),
        timelineByApi: new Map<string, number[]>(),
        globalTimeline: [],
    };
    rateStateByIp.set(ip, next);
    return next;
}

function cleanupExpiredBlocks(state: RateState, currentTime: number): void {
    state.blockedUntilByApi.forEach((blockedUntil, apiKey) => {
        if (blockedUntil <= currentTime) {
            state.blockedUntilByApi.delete(apiKey);
        }
    });
}

function buildAnomalyResponse(): NextResponse {
    return NextResponse.json(
        { error: ANOMALY_BLOCK_MESSAGE, code: 'ANOMALY_BLOCKED' },
        { status: 429 }
    );
}

export function enforceRateLimit(request: Request, apiKey: string): NextResponse | null {
    const currentTime = now();
    cleanupStaleRateStates(currentTime);

    const ip = getClientIp(request);
    const state = getOrCreateRateState(ip);
    state.lastSeenAt = currentTime;
    cleanupExpiredBlocks(state, currentTime);

    const blockedUntil = state.blockedUntilByApi.get(apiKey) ?? 0;
    if (blockedUntil > currentTime) {
        return buildAnomalyResponse();
    }

    state.globalTimeline = pruneTimeline(state.globalTimeline, currentTime);
    state.globalTimeline.push(currentTime);
    if (state.globalTimeline.length > GLOBAL_LIMIT_PER_SEC) {
        state.blockedUntilByApi.set(apiKey, currentTime + BLOCK_DURATION_MS);
        return buildAnomalyResponse();
    }

    const currentApiTimeline = state.timelineByApi.get(apiKey) ?? [];
    const nextApiTimeline = pruneTimeline(currentApiTimeline, currentTime);
    nextApiTimeline.push(currentTime);
    state.timelineByApi.set(apiKey, nextApiTimeline);

    if (nextApiTimeline.length > getSameApiLimit(apiKey)) {
        state.blockedUntilByApi.set(apiKey, currentTime + BLOCK_DURATION_MS);
        return buildAnomalyResponse();
    }

    return null;
}

function sanitizeString(value: string): string {
    return value
        .replace(/<\s*script[^>]*>[\s\S]*?<\s*\/\s*script\s*>/gi, '')
        .replace(/\son[a-z]+\s*=\s*(['"]).*?\1/gi, '')
        .replace(/javascript:/gi, '')
        .replace(/<[^>]+>/g, '')
        .trim();
}

export function sanitizeInput<T>(value: T): T {
    if (typeof value === 'string') {
        return sanitizeString(value) as unknown as T;
    }

    if (Array.isArray(value)) {
        return value.map((item) => sanitizeInput(item)) as unknown as T;
    }

    if (value && typeof value === 'object') {
        const next: Record<string, unknown> = {};
        Object.entries(value as Record<string, unknown>).forEach(([key, entryValue]) => {
            next[key] = sanitizeInput(entryValue);
        });
        return next as unknown as T;
    }

    return value;
}
