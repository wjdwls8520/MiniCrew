import { callBff } from '@/lib/api/client';
import type { ChatMessageItem, ChatRoomItem, ChatUserItem } from '@/types/chat';

const MAX_INITIAL_MESSAGE_LIMIT = 30;
const CHAT_CACHE_MAX_ROOMS = 80;
const CHAT_CACHE_TTL_MS = 12_000;

interface CachedChatMessages {
    messages: ChatMessageItem[];
    expiresAt: number;
}

const recentMessagesCache = new Map<string, CachedChatMessages>();

function getCacheKey(roomId: string, limit: number): string {
    return `${roomId}:${limit}`;
}

function trimChatCacheIfNeeded(): void {
    if (recentMessagesCache.size <= CHAT_CACHE_MAX_ROOMS) {
        return;
    }

    const entries = Array.from(recentMessagesCache.entries())
        .sort((a, b) => a[1].expiresAt - b[1].expiresAt)
        .slice(0, recentMessagesCache.size - CHAT_CACHE_MAX_ROOMS);

    entries.forEach(([key]) => {
        recentMessagesCache.delete(key);
    });
}

function getCachedMessages(roomId: string, limit: number): ChatMessageItem[] | null {
    const cacheKey = getCacheKey(roomId, limit);
    const cached = recentMessagesCache.get(cacheKey);
    if (!cached) {
        return null;
    }

    if (cached.expiresAt < Date.now()) {
        recentMessagesCache.delete(cacheKey);
        return null;
    }

    return cached.messages.map((message) => ({ ...message }));
}

function setCachedMessages(roomId: string, limit: number, messages: ChatMessageItem[]): void {
    const cacheKey = getCacheKey(roomId, limit);
    recentMessagesCache.set(cacheKey, {
        messages: messages.map((message) => ({ ...message })),
        expiresAt: Date.now() + CHAT_CACHE_TTL_MS,
    });
    trimChatCacheIfNeeded();
}

function invalidateRoomMessagesCache(roomId: string): void {
    const normalizedRoomId = roomId.trim();
    if (!normalizedRoomId) {
        return;
    }

    Array.from(recentMessagesCache.keys()).forEach((cacheKey) => {
        if (cacheKey.startsWith(`${normalizedRoomId}:`)) {
            recentMessagesCache.delete(cacheKey);
        }
    });
}

export async function listChatUsers(currentUserId: string): Promise<ChatUserItem[]> {
    return callBff<ChatUserItem[]>({
        action: 'chat.listUsers',
        payload: { currentUserId },
        requireAuth: true,
    });
}

export async function listMyChatRooms(currentUserId: string): Promise<ChatRoomItem[]> {
    return callBff<ChatRoomItem[]>({
        action: 'chat.listMyRooms',
        payload: { currentUserId },
        requireAuth: true,
    });
}

export async function getUnreadChatMessageCountSince(
    roomId: string,
    excludeUserId: string,
    sinceIsoDate: string
): Promise<number> {
    return callBff<number>({
        action: 'chat.getUnreadCountSince',
        payload: { roomId, excludeUserId, sinceIsoDate },
        requireAuth: true,
    });
}

export async function listUnreadCountsByRooms(
    roomIds: string[],
    excludeUserId: string,
    sinceMap: Record<string, string>
): Promise<Record<string, number>> {
    return callBff<Record<string, number>>({
        action: 'chat.listUnreadCountsByRooms',
        payload: { roomIds, excludeUserId, sinceMap },
        requireAuth: true,
    });
}

export async function getOrCreateDirectChatRoom(input: {
    currentUserId: string;
    targetUserId: string;
    targetDisplayName: string;
}): Promise<ChatRoomItem> {
    return callBff<ChatRoomItem>({
        action: 'chat.getOrCreateDirectRoom',
        payload: input,
        requireAuth: true,
    });
}

export async function listRecentChatMessages(
    roomId: string,
    limit = MAX_INITIAL_MESSAGE_LIMIT
): Promise<ChatMessageItem[]> {
    const normalizedRoomId = roomId.trim();
    if (!normalizedRoomId) {
        return [];
    }

    const safeLimit = Math.max(1, Math.min(limit, MAX_INITIAL_MESSAGE_LIMIT));
    const cached = getCachedMessages(normalizedRoomId, safeLimit);
    if (cached) {
        return cached;
    }

    const messages = await callBff<ChatMessageItem[]>({
        action: 'chat.listRecentMessages',
        payload: { roomId: normalizedRoomId, limit: safeLimit },
        requireAuth: true,
    });
    setCachedMessages(normalizedRoomId, safeLimit, messages);
    return messages;
}

export async function sendChatMessage(input: {
    roomId: string;
    senderUserId: string;
    senderName: string;
    body?: string;
    imageUrl?: string | null;
    imageOriginalFilename?: string | null;
    imageStoredFilename?: string | null;
    imageStoragePath?: string | null;
    imageSizeBytes?: number | null;
}): Promise<string> {
    const messageId = await callBff<string>({
        action: 'chat.sendMessage',
        payload: input,
        requireAuth: true,
    });
    invalidateRoomMessagesCache(input.roomId);
    return messageId;
}

export async function hasChatMessageByImageStoragePath(input: {
    roomId: string;
    senderUserId: string;
    imageStoragePath: string;
}): Promise<boolean> {
    return callBff<boolean>({
        action: 'chat.hasMessageByImageStoragePath',
        payload: input,
        requireAuth: true,
    });
}

