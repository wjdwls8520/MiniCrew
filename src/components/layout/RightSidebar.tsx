'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bell, Loader2, MessageSquare, UsersRound, ArrowLeft, Send, ImagePlus, X } from 'lucide-react';
import type { RealtimeChannel, RealtimePostgresInsertPayload } from '@supabase/supabase-js';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { clsx } from 'clsx';
import { useAuth } from '@/context/AuthContext';
import { toErrorMessage } from '@/lib/api/errors';
import { isAnomalyBlockedError } from '@/lib/api/client';
import {
    getOrCreateDirectChatRoom,
    hasChatMessageByImageStoragePath,
    listChatUsers,
    listUnreadCountsByRooms,
    listMyChatRooms,
    listRecentChatMessages,
    sendChatMessage,
} from '@/lib/api/chat';
import { deleteNotification, listNotifications, markNotificationRead, respondProjectInvitation } from '@/lib/api/projectCollaboration';
import { getProfileAvatarUrl } from '@/lib/profileAvatar';
import { supabase } from '@/lib/supabase';
import { cleanupStoredImagePathSafely, uploadOptimizedImage, DEFAULT_IMAGE_MAX_BYTES } from '@/lib/storage/imageUpload';
import type { ProjectNotification } from '@/types/collaboration';
import type { ChatMessageItem, ChatRoomItem, ChatUserItem } from '@/types/chat';

type RightSidebarTab = 'notifications' | 'address' | 'chat';
type AddressPanelMode = 'list' | 'detail';

interface RightSidebarProps {
    isOpen: boolean;
    activeTab: RightSidebarTab;
    onTabChange: (tab: RightSidebarTab) => void;
    onUnreadCountChange?: (count: number) => void;
    onUnreadChatCountChange?: (count: number) => void;
    onOnlineMemberCountChange?: (count: number) => void;
    onClose?: () => void;
}

interface NotificationRealtimeRow {
    id: string;
    recipient_user_id: string;
    actor_user_id: string | null;
    project_id: string | null;
    related_invitation_id: string | null;
    related_request_id: string | null;
    type: ProjectNotification['type'];
    message: string;
    is_read: boolean;
    created_at: string;
}

interface ChatMessageRealtimeRow {
    id: string;
    room_id: string;
    sender_user_id: string;
    sender_name: string;
    body: string | null;
    image_url: string | null;
    image_original_filename: string | null;
    image_stored_filename: string | null;
    image_storage_path: string | null;
    image_size_bytes: number | null;
    created_at: string;
}

interface TypingBroadcastPayload {
    user_id?: string;
    user_name?: string;
    is_typing?: boolean;
}

interface PresenceUser {
    id: string;
    name: string;
}

type ListHeaderUnit = 'member' | 'default';

interface ListHeaderProps {
    title: string;
    count: number;
    unit?: ListHeaderUnit;
}

const TYPING_THROTTLE_MS = 1200;
const TYPING_IDLE_MS = 1800;
const TYPING_EXPIRE_MS = 2500;
const CHAT_READ_STATE_STORAGE_KEY_PREFIX = 'minicrew_chat_room_reads_v1';
const CHAT_PRESENCE_LOBBY_CHANNEL = 'chat:lobby:presence:global';

function getChatReadStateStorageKey(userId: string): string {
    return `${CHAT_READ_STATE_STORAGE_KEY_PREFIX}:${userId}`;
}

function normalizeIsoDate(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return new Date().toISOString();
    }
    return date.toISOString();
}

function getReadStateFromStorage(userId: string): Record<string, string> {
    const key = getChatReadStateStorageKey(userId);
    const raw = window.localStorage.getItem(key);
    if (!raw) {
        return {};
    }

    try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') {
            return {};
        }

        return Object.entries(parsed).reduce<Record<string, string>>((acc, [roomId, value]) => {
            if (typeof roomId !== 'string') {
                return acc;
            }

            if (typeof value === 'string' && value.trim()) {
                acc[roomId] = normalizeIsoDate(value);
            }
            return acc;
        }, {});
    } catch {
        return {};
    }
}

function saveReadStateToStorage(userId: string, nextReadState: Record<string, string>): void {
    const key = getChatReadStateStorageKey(userId);
    window.localStorage.setItem(key, JSON.stringify(nextReadState));
}

function getReadStateUpsertNext(readState: Record<string, string>, roomId: string, readAt: string): Record<string, string> {
    const next: Record<string, string> = { ...readState };
    next[roomId] = normalizeIsoDate(readAt);
    return next;
}

function toNotificationItem(row: NotificationRealtimeRow): ProjectNotification {
    return {
        id: row.id,
        recipientId: row.recipient_user_id,
        actorId: row.actor_user_id,
        projectId: row.project_id,
        relatedInvitationId: row.related_invitation_id,
        relatedRequestId: row.related_request_id,
        type: row.type,
        message: row.message,
        isRead: row.is_read,
        createdAt: row.created_at,
    };
}

function toChatMessageItem(row: ChatMessageRealtimeRow): ChatMessageItem {
    return {
        id: row.id,
        roomId: row.room_id,
        senderUserId: row.sender_user_id,
        senderName: row.sender_name,
        body: row.body ?? '',
        imageUrl: row.image_url,
        imageOriginalFilename: row.image_original_filename,
        imageStoredFilename: row.image_stored_filename,
        imageStoragePath: row.image_storage_path,
        imageSizeBytes: row.image_size_bytes,
        createdAt: row.created_at,
    };
}

function getNotificationTypeLabel(type: ProjectNotification['type']): string {
    switch (type) {
        case 'PROJECT_INVITED':
            return '초대';
        case 'INVITATION_ACCEPTED':
            return '수락';
        case 'INVITATION_DECLINED':
            return '거절';
        case 'JOIN_REQUEST_CREATED':
            return '참여 신청';
        case 'JOIN_REQUEST_APPROVED':
            return '신청 승인';
        case 'JOIN_REQUEST_REJECTED':
            return '신청 거절';
        case 'PROJECT_MEMBER_ROLE_CHANGED':
            return '권한 변경';
        case 'BOARD_TASK_CREATED':
            return '새 업무';
        case 'BOARD_POST_CREATED':
            return '새 글';
        case 'BOARD_COMMENT_CREATED':
            return '댓글';
        case 'BOARD_REPLY_CREATED':
            return '답글';
        case 'PROJECT_STATUS_CHANGED':
            return '프로젝트 상태';
        case 'TASK_STATUS_CHANGED':
            return '업무 상태';
        default:
            return '알림';
    }
}

function formatDateTime(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value;
    }

    return date.toLocaleString('ko-KR', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    });
}

function formatSidebarCountBadge(count: number): string {
    if (!Number.isFinite(count) || count <= 0) {
        return '0';
    }
    return count > 99 ? '99+' : String(count);
}

function buildChatRoomsFilterValue(roomIds: string[]): string {
    if (roomIds.length === 0) {
        return '';
    }
    return roomIds.map((id) => `"${id}"`).join(',');
}

function collectOnlineUserIdsFromPresenceState(
    state: Record<string, unknown>
): Set<string> {
    const nextSet = new Set<string>();

    Object.entries(state).forEach(([presenceKey, rawValue]) => {
        const normalizedKey = presenceKey.trim();
        if (normalizedKey) {
            nextSet.add(normalizedKey);
        }

        const pushFromEntry = (entry: unknown) => {
            if (!entry || typeof entry !== 'object') {
                return;
            }
            const record = entry as Record<string, unknown>;
            const id =
                (typeof record.id === 'string' ? record.id : '') ||
                (typeof record.user_id === 'string' ? record.user_id : '') ||
                (typeof record.userId === 'string' ? record.userId : '');
            const normalizedId = id.trim();
            if (normalizedId) {
                nextSet.add(normalizedId);
            }
        };

        if (Array.isArray(rawValue)) {
            rawValue.forEach((entry) => {
                pushFromEntry(entry);
            });
            return;
        }

        if (rawValue && typeof rawValue === 'object') {
            const record = rawValue as Record<string, unknown>;
            if (Array.isArray(record.metas)) {
                record.metas.forEach((entry) => {
                    pushFromEntry(entry);
                });
            } else {
                pushFromEntry(record);
            }
        }
    });

    return nextSet;
}

function ListHeader({ title, count, unit = 'default' }: ListHeaderProps) {
    const displayCount = formatSidebarCountBadge(count);
    const countLabel = unit === 'member' ? `${displayCount}명` : `${displayCount}개`;

    return (
        <div className="mb-2 flex items-center justify-between">
            <h4 className="text-xs font-semibold text-gray-500">
                {title} {countLabel}
            </h4>
        </div>
    );
}

export const RightSidebar: React.FC<RightSidebarProps> = ({
    isOpen,
    activeTab,
    onTabChange,
    onUnreadCountChange,
    onUnreadChatCountChange,
    onOnlineMemberCountChange,
    onClose,
}) => {
    const router = useRouter();
    const { user, isAuthenticated, displayName } = useAuth();

    const [notifications, setNotifications] = useState<ProjectNotification[]>([]);
    const [isNotificationsLoading, setIsNotificationsLoading] = useState(false);
    const [notificationsError, setNotificationsError] = useState<string | null>(null);
    const [markingNotificationId, setMarkingNotificationId] = useState<string | null>(null);

    const [chatUsers, setChatUsers] = useState<ChatUserItem[]>([]);
    const [chatUsersError, setChatUsersError] = useState<string | null>(null);
    const [isChatUsersLoading, setIsChatUsersLoading] = useState(false);
    const [isCreatingDirectRoom, setIsCreatingDirectRoom] = useState(false);
    const [addressMemberId, setAddressMemberId] = useState<string | null>(null);

    const [chatRooms, setChatRooms] = useState<ChatRoomItem[]>([]);
    const [chatRoomsError, setChatRoomsError] = useState<string | null>(null);
    const [isChatRoomsLoading, setIsChatRoomsLoading] = useState(false);
    const [selectedChatRoomId, setSelectedChatRoomId] = useState<string | null>(null);
    const [chatRoomReadAtMap, setChatRoomReadAtMap] = useState<Record<string, string>>({});
    const [chatUnreadCountsByRoom, setChatUnreadCountsByRoom] = useState<Record<string, number>>({});

    const [currentChatRoom, setCurrentChatRoom] = useState<ChatRoomItem | null>(null);
    const [chatMessages, setChatMessages] = useState<ChatMessageItem[]>([]);
    const [isChatLoading, setIsChatLoading] = useState(false);
    const [chatError, setChatError] = useState<string | null>(null);
    const [chatInput, setChatInput] = useState('');
    const [chatImageFile, setChatImageFile] = useState<File | null>(null);
    const [chatImagePreviewUrl, setChatImagePreviewUrl] = useState<string>('');
    const [isSendingChatMessage, setIsSendingChatMessage] = useState(false);

    const [typingUsers, setTypingUsers] = useState<PresenceUser[]>([]);
    const [onlineUserIds, setOnlineUserIds] = useState<string[]>([]);
    const presenceSubscribedRef = useRef(false);

    const chatChannelRef = useRef<RealtimeChannel | null>(null);
    const chatPresenceChannelRef = useRef<RealtimeChannel | null>(null);
    const typingExpireTimerMapRef = useRef<Map<string, number>>(new Map());
    const typingStopDebounceTimerRef = useRef<number | null>(null);
    const typingThrottleTimerRef = useRef<number | null>(null);
    const lastTypingSentAtRef = useRef(0);
    const chatScrollContainerRef = useRef<HTMLDivElement | null>(null);
    const chatImageObjectUrlRef = useRef<string | null>(null);
    const unreadMessagesChannelRef = useRef<RealtimeChannel | null>(null);
    const chatRoomMembershipChannelRef = useRef<RealtimeChannel | null>(null);
    const presenceReconnectTimerRef = useRef<number | null>(null);
    const refreshChatRoomsRef = useRef<(() => Promise<void>) | null>(null);
    const wasSidebarOpenRef = useRef(isOpen);

    const unreadCount = useMemo(
        () => notifications.filter((notification) => !notification.isRead).length,
        [notifications]
    );
    const unreadChatCount = useMemo(
        () =>
            Object.values(chatUnreadCountsByRoom).reduce((acc, value) => acc + (Number.isFinite(value) ? value : 0), 0),
        [chatUnreadCountsByRoom]
    );
    const addressPanelMode: AddressPanelMode = useMemo(
        () => (addressMemberId ? 'detail' : 'list'),
        [addressMemberId]
    );
    const selectedAddressMember = useMemo(
        () => chatUsers.find((chatUser) => chatUser.userId === addressMemberId) ?? null,
        [addressMemberId, chatUsers]
    );
    const isSelectedAddressMemberSelf = useMemo(
        () => Boolean(selectedAddressMember && user?.id && selectedAddressMember.userId === user.id),
        [selectedAddressMember, user?.id]
    );
    const selectedRoom = useMemo(
        () => chatRooms.find((chatRoom) => chatRoom.id === selectedChatRoomId) ?? null,
        [chatRooms, selectedChatRoomId]
    );
    const onlineUserIdSet = useMemo(() => new Set(onlineUserIds), [onlineUserIds]);
    const typingSummary = useMemo(() => {
        if (typingUsers.length === 0) {
            return '';
        }
        return `${typingUsers.map((typingUser) => typingUser.name).join(', ')} 입력 중...`;
    }, [typingUsers]);

    useEffect(() => {
        onUnreadCountChange?.(unreadCount);
    }, [onUnreadCountChange, unreadCount]);

    useEffect(() => {
        onUnreadChatCountChange?.(unreadChatCount);
    }, [onUnreadChatCountChange, unreadChatCount]);

    useEffect(() => {
        onOnlineMemberCountChange?.(onlineUserIds.length);
    }, [onOnlineMemberCountChange, onlineUserIds]);

    useEffect(() => {
        if (isAuthenticated && user?.id) {
            return;
        }

        setChatUnreadCountsByRoom({});
        setChatRoomReadAtMap({});
        setSelectedChatRoomId(null);
        setCurrentChatRoom(null);
    }, [isAuthenticated, user?.id]);

    const clearTypingTimers = useCallback(() => {
        typingExpireTimerMapRef.current.forEach((timerId) => {
            window.clearTimeout(timerId);
        });
        typingExpireTimerMapRef.current.clear();

        if (typingStopDebounceTimerRef.current !== null) {
            window.clearTimeout(typingStopDebounceTimerRef.current);
            typingStopDebounceTimerRef.current = null;
        }

        if (typingThrottleTimerRef.current !== null) {
            window.clearTimeout(typingThrottleTimerRef.current);
            typingThrottleTimerRef.current = null;
        }

        lastTypingSentAtRef.current = 0;
        setTypingUsers([]);
    }, []);

    const connectPresenceChannel = useCallback(() => {
        if (presenceReconnectTimerRef.current !== null) {
            window.clearTimeout(presenceReconnectTimerRef.current);
            presenceReconnectTimerRef.current = null;
        }

        // Do not reconnect if already subscribed
        if (presenceSubscribedRef.current && chatPresenceChannelRef.current) {
            return;
        }

        if (!user?.id || !isAuthenticated) return;

        // Clean up existing channel if any
        if (chatPresenceChannelRef.current) {
            void supabase.removeChannel(chatPresenceChannelRef.current);
            chatPresenceChannelRef.current = null;
        }

        presenceSubscribedRef.current = false;

        const presenceChannel = supabase
            .channel(CHAT_PRESENCE_LOBBY_CHANNEL, {
                config: {
                    presence: { key: user.id },
                },
            })
            .on('presence', { event: 'sync' }, () => {
                const state = presenceChannel.presenceState() as Record<string, unknown>;
                const nextSet = collectOnlineUserIdsFromPresenceState(state);
                if (user?.id) {
                    nextSet.add(user.id);
                }
                setOnlineUserIds(Array.from(nextSet));
            });

        chatPresenceChannelRef.current = presenceChannel;

        presenceChannel.subscribe((status) => {
            if (status === 'SUBSCRIBED' && user?.id) {
                presenceSubscribedRef.current = true;
                setOnlineUserIds((prev) => (prev.includes(user.id) ? prev : [...prev, user.id]));
                void presenceChannel.track({
                    id: user.id,
                    name: displayName || '사용자',
                });
                return;
            }

            if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
                presenceSubscribedRef.current = false;
                // Schedule reconnect with exponential backoff
                if (presenceReconnectTimerRef.current === null) {
                    presenceReconnectTimerRef.current = window.setTimeout(() => {
                        presenceReconnectTimerRef.current = null;
                        connectPresenceChannel();
                    }, 5000);
                }
            }
        });
    }, [user?.id, isAuthenticated, displayName]);

    const clearChatImageSelection = useCallback(() => {
        if (chatImageObjectUrlRef.current) {
            URL.revokeObjectURL(chatImageObjectUrlRef.current);
            chatImageObjectUrlRef.current = null;
        }
        setChatImageFile(null);
        setChatImagePreviewUrl('');
    }, []);

    const refreshNotifications = useCallback(async () => {
        if (!isAuthenticated || !user?.id) {
            setNotifications([]);
            setNotificationsError(null);
            setIsNotificationsLoading(false);
            return;
        }

        setIsNotificationsLoading(true);
        setNotificationsError(null);

        try {
            const rows = await listNotifications(user.id);
            setNotifications(rows);
        } catch (error) {
            if (isAnomalyBlockedError(error)) {
                setNotificationsError(null);
                return;
            }
            setNotificationsError(toErrorMessage(error, '알림 목록을 불러오지 못했습니다.'));
        } finally {
            setIsNotificationsLoading(false);
        }
    }, [isAuthenticated, user?.id]);

    useEffect(() => {
        if (!isOpen || activeTab !== 'notifications') {
            return;
        }

        void refreshNotifications();
    }, [activeTab, isOpen, refreshNotifications]);

    useEffect(() => {
        if (!isAuthenticated || !user?.id) {
            return;
        }

        void refreshNotifications();
    }, [isAuthenticated, refreshNotifications, user?.id]);

    useEffect(() => {
        if (!isAuthenticated || !user?.id) {
            return;
        }

        const channel = supabase
            .channel(`notifications:${user.id}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'notifications',
                    filter: `recipient_user_id=eq.${user.id}`,
                },
                (payload) => {
                    if (payload.eventType === 'DELETE') {
                        const deletedId = (payload.old as { id?: string } | null)?.id;
                        if (!deletedId) {
                            return;
                        }
                        setNotifications((prev) => prev.filter((item) => item.id !== deletedId));
                        return;
                    }

                    const nextRaw = payload.new as NotificationRealtimeRow | null;
                    if (!nextRaw?.id) {
                        return;
                    }

                    const nextItem = toNotificationItem(nextRaw);
                    setNotifications((prev) => {
                        const currentIndex = prev.findIndex((item) => item.id === nextItem.id);
                        if (currentIndex === -1) {
                            return [nextItem, ...prev];
                        }

                        const next = [...prev];
                        next[currentIndex] = nextItem;
                        return next;
                    });
                }
            )
            .subscribe();

        return () => {
            void supabase.removeChannel(channel);
        };
    }, [isAuthenticated, user?.id]);

    const refreshAddressMembers = useCallback(async () => {
        if (!isAuthenticated || !user?.id) {
            setChatUsers([]);
            setAddressMemberId(null);
            setChatUsersError(null);
            setIsChatUsersLoading(false);
            return;
        }

        setIsChatUsersLoading(true);
        setChatUsersError(null);

        try {
            const rows = await listChatUsers(user.id);
            setChatUsers(rows);
            setAddressMemberId((prev) => (prev && rows.some((row) => row.userId === prev) ? prev : null));
        } catch (error) {
            if (isAnomalyBlockedError(error)) {
                setChatUsers([]);
                setAddressMemberId(null);
                setChatUsersError(null);
                return;
            }
            setChatUsers([]);
            setAddressMemberId(null);
            setChatUsersError(toErrorMessage(error, '주소록 목록을 불러오지 못했습니다.'));
        } finally {
            setIsChatUsersLoading(false);
        }
    }, [isAuthenticated, user?.id]);

    const refreshChatUnreadCounts = useCallback(async (rooms: ChatRoomItem[]) => {
        if (!isAuthenticated || !user?.id) {
            setChatUnreadCountsByRoom({});
            setChatRoomReadAtMap({});
            return;
        }

        if (rooms.length === 0) {
            setChatUnreadCountsByRoom({});
            return;
        }

        const persistedState = getReadStateFromStorage(user.id);
        const seededState = { ...persistedState, ...chatRoomReadAtMap };
        const nextReadState: Record<string, string> = {};

        rooms.forEach((room) => {
            const existingReadAt = seededState[room.id];
            if (!existingReadAt) {
                return;
            }

            nextReadState[room.id] = existingReadAt;
        });

        setChatRoomReadAtMap(nextReadState);
        if (JSON.stringify(persistedState) !== JSON.stringify(nextReadState)) {
            saveReadStateToStorage(user.id, nextReadState);
        }

        try {
            const roomIds = rooms.map((room) => room.id);
            const unreadCountMap = await listUnreadCountsByRooms(roomIds, user.id, nextReadState);
            const nextUnreadCounts = roomIds.reduce<Record<string, number>>((acc, roomId) => {
                acc[roomId] = unreadCountMap[roomId] ?? 0;
                return acc;
            }, {});

            setChatUnreadCountsByRoom(nextUnreadCounts);
        } catch (error) {
            if (isAnomalyBlockedError(error)) {
                return;
            }
            setChatUnreadCountsByRoom({});
            console.error(toErrorMessage(error, '채팅 미확인 메시지 수를 불러오지 못했습니다.'));
        }
    }, [chatRoomReadAtMap, isAuthenticated, user?.id]);

    const markChatRoomAsRead = useCallback((roomId: string) => {
        if (!isAuthenticated || !user?.id || !roomId) {
            return;
        }

        setChatUnreadCountsByRoom((prev) => {
            if (prev[roomId] === 0) {
                return prev;
            }

            return { ...prev, [roomId]: 0 };
        });

        const now = new Date().toISOString();
        setChatRoomReadAtMap((prev) => {
            const next = getReadStateUpsertNext(prev, roomId, now);
            saveReadStateToStorage(user.id, next);
            return next;
        });
    }, [isAuthenticated, user?.id]);

    const refreshChatRooms = useCallback(async () => {
        if (!isAuthenticated || !user?.id) {
            setChatRooms([]);
            setChatRoomsError(null);
            setSelectedChatRoomId(null);
            setChatUnreadCountsByRoom({});
            setChatRoomReadAtMap({});
            setIsChatRoomsLoading(false);
            return;
        }

        setIsChatRoomsLoading(true);
        setChatRoomsError(null);

        try {
            const rows = await listMyChatRooms(user.id);
            setChatRooms(rows);
            setSelectedChatRoomId((prev) => (prev && rows.some((room) => room.id === prev) ? prev : null));
            await refreshChatUnreadCounts(rows);
        } catch (error) {
            if (isAnomalyBlockedError(error)) {
                setChatRooms([]);
                setSelectedChatRoomId(null);
                setChatUnreadCountsByRoom({});
                setChatRoomReadAtMap({});
                setChatRoomsError(null);
                return;
            }
            setChatRooms([]);
            setSelectedChatRoomId(null);
            setChatUnreadCountsByRoom({});
            setChatRoomReadAtMap({});
            setChatRoomsError(toErrorMessage(error, '채팅방을 불러오지 못했습니다.'));
        } finally {
            setIsChatRoomsLoading(false);
        }
    }, [isAuthenticated, refreshChatUnreadCounts, user?.id]);

    useEffect(() => {
        refreshChatRoomsRef.current = refreshChatRooms;
    }, [refreshChatRooms]);

    useEffect(() => {
        if (!isAuthenticated || !user?.id) {
            return;
        }

        void refreshChatRoomsRef.current?.();
    }, [isAuthenticated, user?.id]);

    useEffect(() => {
        if (!isAuthenticated || !user?.id) {
            if (chatRoomMembershipChannelRef.current) {
                void supabase.removeChannel(chatRoomMembershipChannelRef.current);
                chatRoomMembershipChannelRef.current = null;
            }
            return;
        }

        if (chatRoomMembershipChannelRef.current) {
            void supabase.removeChannel(chatRoomMembershipChannelRef.current);
            chatRoomMembershipChannelRef.current = null;
        }

        const channel = supabase
            .channel(`chat:rooms:${user.id}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'chat_room_members',
                    filter: `user_id=eq.${user.id}`,
                },
                () => {
                    void refreshChatRoomsRef.current?.();
                }
            );

        chatRoomMembershipChannelRef.current = channel;
        channel.subscribe();

        return () => {
            if (chatRoomMembershipChannelRef.current === channel) {
                chatRoomMembershipChannelRef.current = null;
            }
            void supabase.removeChannel(channel);
        };
    }, [isAuthenticated, user?.id]);

    useEffect(() => {
        if (!isOpen || activeTab !== 'address') {
            return;
        }
        void refreshAddressMembers();
    }, [isOpen, activeTab, refreshAddressMembers]);

    useEffect(() => {
        if (activeTab !== 'address') {
            setAddressMemberId(null);
            return;
        }
    }, [activeTab]);

    useEffect(() => {
        if (activeTab !== 'chat') {
            clearChatImageSelection();
        }
    }, [activeTab, clearChatImageSelection]);

    useEffect(() => {
        if (!isOpen || activeTab !== 'chat') {
            return;
        }
        void refreshChatRoomsRef.current?.();
    }, [isOpen, activeTab]);

    useEffect(() => {
        const wasOpen = wasSidebarOpenRef.current;
        if (!wasOpen && isOpen && activeTab === 'chat') {
            setSelectedChatRoomId(null);
        }
        wasSidebarOpenRef.current = isOpen;
    }, [activeTab, isOpen]);

    const handleMarkRead = useCallback(
        async (notification: ProjectNotification) => {
            if (notification.isRead || markingNotificationId) {
                return;
            }

            setMarkingNotificationId(notification.id);
            try {
                await markNotificationRead(notification.id);
                setNotifications((prev) =>
                    prev.map((item) => (item.id === notification.id ? { ...item, isRead: true } : item)
                    ));
            } catch (error) {
                if (isAnomalyBlockedError(error)) {
                    setNotificationsError(null);
                    return;
                }
                setNotificationsError(toErrorMessage(error, '알림 읽음 상태를 변경하지 못했습니다.'));
            } finally {
                setMarkingNotificationId(null);
            }
        },
        [markingNotificationId]
    );

    const handleMoveProject = useCallback(
        (notification: ProjectNotification) => {
            if (!notification.projectId) {
                return;
            }

            router.push(`/project/${notification.projectId}`);
            onClose?.();
        },
        [onClose, router]
    );

    const handleDeleteNotification = useCallback(
        async (notification: ProjectNotification) => {
            if (markingNotificationId) {
                return;
            }

            setMarkingNotificationId(notification.id);
            try {
                await deleteNotification(notification.id);
                setNotifications((prev) => prev.filter((item) => item.id !== notification.id));
            } catch (error) {
                if (isAnomalyBlockedError(error)) {
                    setNotificationsError(null);
                    return;
                }
                setNotificationsError(toErrorMessage(error, '알림 삭제에 실패했습니다.'));
            } finally {
                setMarkingNotificationId(null);
            }
        },
        [markingNotificationId]
    );

    const handleAcceptInvitationAndMoveProject = useCallback(
        async (notification: ProjectNotification) => {
            if (!notification.projectId || !notification.relatedInvitationId || markingNotificationId) {
                return;
            }

            setMarkingNotificationId(notification.id);
            try {
                await respondProjectInvitation(notification.relatedInvitationId, 'ACCEPTED', {
                    userId: user?.id ?? null,
                    email: user?.email ?? null,
                    displayName: displayName || '사용자',
                });

                setNotifications((prev) => prev.filter((item) => item.id !== notification.id));
                router.push(`/project/${notification.projectId}`);
                onClose?.();
            } catch (error) {
                if (isAnomalyBlockedError(error)) {
                    setNotificationsError(null);
                    return;
                }
                setNotificationsError(toErrorMessage(error, '초대 수락 처리 중 오류가 발생했습니다.'));
            } finally {
                setMarkingNotificationId(null);
            }
        },
        [displayName, markingNotificationId, onClose, router, user?.email, user?.id]
    );

    useEffect(() => {
        if (!isAuthenticated || !user?.id || !selectedRoom?.id) {
            setCurrentChatRoom(null);
            setChatMessages([]);
            setChatError(null);
            setIsChatLoading(false);
            setChatInput('');
            clearChatImageSelection();
            clearTypingTimers();
            return;
        }

        let isDisposed = false;
        setCurrentChatRoom(selectedRoom);
        setIsChatLoading(true);
        setChatError(null);
        setChatMessages([]);
        setChatInput('');
        clearChatImageSelection();
        clearTypingTimers();

        const loadRoom = async () => {
            try {
                const messages = await listRecentChatMessages(selectedRoom.id, 30);
                if (isDisposed) {
                    return;
                }
                setChatMessages(messages);
            } catch (error) {
                if (isDisposed) {
                    return;
                }
                if (isAnomalyBlockedError(error)) {
                    setChatMessages([]);
                    setChatError(null);
                    return;
                }
                setChatMessages([]);
                setChatError(toErrorMessage(error, '채팅방을 불러오지 못했습니다.'));
            } finally {
                if (!isDisposed) {
                    setIsChatLoading(false);
                }
            }
        };

        void loadRoom();

        return () => {
            isDisposed = true;
        };
    }, [clearChatImageSelection, clearTypingTimers, isAuthenticated, selectedRoom, selectedChatRoomId, user?.id]);

    useEffect(() => {
        const roomId = currentChatRoom?.id;
        if (!isAuthenticated || !user?.id || !roomId) {
            if (chatChannelRef.current) {
                void supabase.removeChannel(chatChannelRef.current);
                chatChannelRef.current = null;
            }
            clearTypingTimers();
            return;
        }

        if (chatChannelRef.current) {
            void supabase.removeChannel(chatChannelRef.current);
            chatChannelRef.current = null;
        }

        clearTypingTimers();

        const channel = supabase
            .channel(`chat:room:${roomId}`, {
                config: {
                    broadcast: { ack: false },
                },
            })
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'chat_messages',
                    filter: `room_id=eq.${roomId}`,
                },
                (payload: RealtimePostgresInsertPayload<ChatMessageRealtimeRow>) => {
                    const inserted = payload.new;
                    if (!inserted?.id) {
                        return;
                    }

                    const nextItem = toChatMessageItem(inserted);
                    setChatMessages((prev) => {
                        if (prev.some((item) => item.id === nextItem.id)) {
                            return prev;
                        }
                        return [...prev, nextItem];
                    });
                }
            )
            .on('broadcast', { event: 'typing' }, (event) => {
                const payload = (event as { payload?: TypingBroadcastPayload }).payload;
                const typingUserId = payload?.user_id?.trim();

                if (!typingUserId || typingUserId === user.id) {
                    return;
                }

                const typingUserName = payload?.user_name?.trim() || '사용자';
                const isTyping = Boolean(payload?.is_typing);

                if (!isTyping) {
                    const timerId = typingExpireTimerMapRef.current.get(typingUserId);
                    if (timerId) {
                        window.clearTimeout(timerId);
                        typingExpireTimerMapRef.current.delete(typingUserId);
                    }
                    setTypingUsers((prev) => prev.filter((entry) => entry.id !== typingUserId));
                    return;
                }

                setTypingUsers((prev) => {
                    const exists = prev.some((entry) => entry.id === typingUserId);
                    if (exists) {
                        return prev.map((entry) => (entry.id === typingUserId ? { ...entry, name: typingUserName } : entry));
                    }
                    return [...prev, { id: typingUserId, name: typingUserName }];
                });

                const currentTimerId = typingExpireTimerMapRef.current.get(typingUserId);
                if (currentTimerId) {
                    window.clearTimeout(currentTimerId);
                }

                const expireTimerId = window.setTimeout(() => {
                    typingExpireTimerMapRef.current.delete(typingUserId);
                    setTypingUsers((prev) => prev.filter((entry) => entry.id !== typingUserId));
                }, TYPING_EXPIRE_MS);
                typingExpireTimerMapRef.current.set(typingUserId, expireTimerId);
            });

        chatChannelRef.current = channel;
        channel.subscribe();

        return () => {
            if (chatChannelRef.current === channel) {
                chatChannelRef.current = null;
            }
            clearTypingTimers();
            void supabase.removeChannel(channel);
        };
    }, [clearTypingTimers, currentChatRoom?.id, isAuthenticated, user?.id]);

    useEffect(() => {
        if (!isAuthenticated || !user?.id || chatRooms.length === 0) {
            if (unreadMessagesChannelRef.current) {
                void supabase.removeChannel(unreadMessagesChannelRef.current);
                unreadMessagesChannelRef.current = null;
            }
            return;
        }

        if (unreadMessagesChannelRef.current) {
            void supabase.removeChannel(unreadMessagesChannelRef.current);
            unreadMessagesChannelRef.current = null;
        }

        const roomFilterIds = buildChatRoomsFilterValue(chatRooms.map((room) => room.id));
        if (!roomFilterIds) {
            return;
        }

        const channel = supabase.channel(`chat:unread:${user.id}`, {
            config: {
                broadcast: { ack: false },
            },
        }).on(
            'postgres_changes',
            {
                event: 'INSERT',
                schema: 'public',
                table: 'chat_messages',
                filter: `room_id=in.(${roomFilterIds})`,
            },
            (payload: RealtimePostgresInsertPayload<ChatMessageRealtimeRow>) => {
                const inserted = payload.new;
                if (!inserted?.room_id || !inserted?.sender_user_id) {
                    return;
                }

                if (inserted.sender_user_id === user.id) {
                    return;
                }

                if (isOpen && activeTab === 'chat' && inserted.room_id === selectedChatRoomId) {
                    markChatRoomAsRead(inserted.room_id);
                    return;
                }

                setChatUnreadCountsByRoom((prev) => ({
                    ...prev,
                    [inserted.room_id]: (prev[inserted.room_id] || 0) + 1,
                }));
            }
        );

        unreadMessagesChannelRef.current = channel;
        channel.subscribe();

        return () => {
            if (unreadMessagesChannelRef.current === channel) {
                unreadMessagesChannelRef.current = null;
            }
            void supabase.removeChannel(channel);
        };
    }, [
        chatRooms,
        activeTab,
        isOpen,
        isAuthenticated,
        markChatRoomAsRead,
        selectedChatRoomId,
        user?.id,
    ]);

    useEffect(() => {
        const shouldTrackPresence = isAuthenticated && Boolean(user?.id);

        if (!shouldTrackPresence) {
            if (presenceReconnectTimerRef.current !== null) {
                window.clearTimeout(presenceReconnectTimerRef.current);
                presenceReconnectTimerRef.current = null;
            }
            if (chatPresenceChannelRef.current) {
                presenceSubscribedRef.current = false;
                void supabase.removeChannel(chatPresenceChannelRef.current);
                chatPresenceChannelRef.current = null;
            }
            setOnlineUserIds([]);
            return;
        }

        if (user?.id) {
            setOnlineUserIds([user.id]);
        }

        connectPresenceChannel();

        return () => {
            if (presenceReconnectTimerRef.current !== null) {
                window.clearTimeout(presenceReconnectTimerRef.current);
                presenceReconnectTimerRef.current = null;
            }
            if (chatPresenceChannelRef.current) {
                presenceSubscribedRef.current = false;
                void supabase.removeChannel(chatPresenceChannelRef.current);
                chatPresenceChannelRef.current = null;
            }
            setOnlineUserIds([]);
        };
    }, [isAuthenticated, user?.id, connectPresenceChannel]);

    const sendTypingSignal = useCallback(
        (isTyping: boolean) => {
            const channel = chatChannelRef.current;
            if (!channel || !user?.id) {
                return;
            }

            void channel.send({
                type: 'broadcast',
                event: 'typing',
                payload: {
                    user_id: user.id,
                    user_name: displayName || '사용자',
                    is_typing: isTyping,
                },
            });
        },
        [displayName, user?.id]
    );

    const stopTyping = useCallback(() => {
        if (typingStopDebounceTimerRef.current !== null) {
            window.clearTimeout(typingStopDebounceTimerRef.current);
            typingStopDebounceTimerRef.current = null;
        }

        if (typingThrottleTimerRef.current !== null) {
            window.clearTimeout(typingThrottleTimerRef.current);
            typingThrottleTimerRef.current = null;
        }

        sendTypingSignal(false);
        lastTypingSentAtRef.current = 0;
    }, [sendTypingSignal]);

    const handleChatInputChange = useCallback(
        (event: React.ChangeEvent<HTMLTextAreaElement>) => {
            const value = event.target.value;
            setChatInput(value);

            if (!currentChatRoom?.id || !user?.id) {
                return;
            }

            const hasText = value.trim().length > 0;
            if (!hasText) {
                stopTyping();
                return;
            }

            const now = Date.now();
            const elapsed = now - lastTypingSentAtRef.current;
            if (elapsed >= TYPING_THROTTLE_MS) {
                sendTypingSignal(true);
                lastTypingSentAtRef.current = now;
            } else if (typingThrottleTimerRef.current === null) {
                typingThrottleTimerRef.current = window.setTimeout(() => {
                    sendTypingSignal(true);
                    lastTypingSentAtRef.current = Date.now();
                    typingThrottleTimerRef.current = null;
                }, TYPING_THROTTLE_MS - elapsed);
            }

            if (typingStopDebounceTimerRef.current !== null) {
                window.clearTimeout(typingStopDebounceTimerRef.current);
            }

            typingStopDebounceTimerRef.current = window.setTimeout(() => {
                stopTyping();
            }, TYPING_IDLE_MS);
        },
        [currentChatRoom?.id, sendTypingSignal, stopTyping, user?.id]
    );

    const handleChatImageChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.currentTarget.value = '';

        if (!file) {
            return;
        }

        if (file.type.startsWith('video/')) {
            setChatError('영상 파일은 전송할 수 없습니다.');
            return;
        }

        if (!file.type.startsWith('image/')) {
            setChatError('이미지 파일만 전송할 수 있습니다.');
            return;
        }

        if (file.size > DEFAULT_IMAGE_MAX_BYTES) {
            alert('1MB를 초과한 이미지는 전송 시 1MB 이하로 자동 최적화되며 화질 저하가 발생할 수 있습니다.');
        }

        if (chatImageObjectUrlRef.current) {
            URL.revokeObjectURL(chatImageObjectUrlRef.current);
            chatImageObjectUrlRef.current = null;
        }

        const objectUrl = URL.createObjectURL(file);
        chatImageObjectUrlRef.current = objectUrl;
        setChatImageFile(file);
        setChatImagePreviewUrl(objectUrl);
        setChatError(null);
    }, []);

    const handleChatImageRemove = useCallback(() => {
        clearChatImageSelection();
    }, [clearChatImageSelection]);

    const handleSendChatMessage = useCallback(async () => {
        if (!isAuthenticated || !user?.id || !currentChatRoom?.id || isSendingChatMessage) {
            return;
        }

        const nextBody = chatInput.trim();
        if (!nextBody && !chatImageFile) {
            return;
        }

        setIsSendingChatMessage(true);
        setChatError(null);

        let uploadedImage: Awaited<ReturnType<typeof uploadOptimizedImage>> | null = null;
        let hasCommittedMessage = false;
        try {
            if (chatImageFile) {
                uploadedImage = await uploadOptimizedImage({
                    file: chatImageFile,
                    userId: user.id,
                    folder: 'chat_messages',
                });
            }

            await sendChatMessage({
                roomId: currentChatRoom.id,
                senderUserId: user.id,
                senderName: displayName || '사용자',
                body: nextBody || undefined,
                imageUrl: uploadedImage?.publicUrl ?? null,
                imageOriginalFilename: uploadedImage?.originalFilename ?? null,
                imageStoredFilename: uploadedImage?.storedFilename ?? null,
                imageStoragePath: uploadedImage?.storagePath ?? null,
                imageSizeBytes: uploadedImage?.sizeBytes ?? null,
            });
            hasCommittedMessage = true;

            setChatInput('');
            clearChatImageSelection();
            stopTyping();
        } catch (error) {
            if (isAnomalyBlockedError(error)) {
                setChatError(null);
                return;
            }
            const rawErrorMessage = error instanceof Error ? error.message : String(error ?? '');
            const isNetworkUncertain = /Failed to fetch|NetworkError|timeout|timed out/i.test(rawErrorMessage);
            const uploadedPath = uploadedImage?.storagePath ?? '';

            if (!hasCommittedMessage && uploadedPath) {
                if (!isNetworkUncertain) {
                    void cleanupStoredImagePathSafely(uploadedPath);
                } else {
                    try {
                        const messageExists = await hasChatMessageByImageStoragePath({
                            roomId: currentChatRoom.id,
                            senderUserId: user.id,
                            imageStoragePath: uploadedPath,
                        });

                        if (!messageExists) {
                            void cleanupStoredImagePathSafely(uploadedPath);
                        }
                    } catch {
                        // 상태를 확정할 수 없는 경우 파일을 유지해 데이터 불일치를 피함
                    }
                }
            }
            setChatError(toErrorMessage(error, '메시지를 전송하지 못했습니다.'));
        } finally {
            setIsSendingChatMessage(false);
        }
    }, [
        chatImageFile,
        chatInput,
        clearChatImageSelection,
        currentChatRoom?.id,
        displayName,
        isAuthenticated,
        isSendingChatMessage,
        stopTyping,
        user?.id,
    ]);

    const handleChatInputKeyDown = useCallback(
        (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
            if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) {
                return;
            }

            event.preventDefault();
            void handleSendChatMessage();
        },
        [handleSendChatMessage]
    );

    const handleChatRoomSelect = (roomId: string) => {
        setSelectedChatRoomId((prev) => (prev === roomId ? prev : roomId));
        markChatRoomAsRead(roomId);
    };

    const ensureChatRoomInList = useCallback((room: ChatRoomItem) => {
        setChatRooms((prev) => {
            if (prev.some((item) => item.id === room.id)) {
                return prev;
            }
            return [room, ...prev];
        });
        setSelectedChatRoomId(room.id);
    }, []);

    const handleChatWithAddressMember = useCallback(async () => {
        if (!selectedAddressMember || !user?.id || isCreatingDirectRoom) {
            return;
        }
        if (selectedAddressMember.userId === user.id) {
            return;
        }

        setIsCreatingDirectRoom(true);
        setChatUsersError(null);
        try {
            setChatError(null);
            const room = await getOrCreateDirectChatRoom({
                currentUserId: user.id,
                targetUserId: selectedAddressMember.userId,
                targetDisplayName: selectedAddressMember.displayName,
            });

            ensureChatRoomInList(room);
            void refreshChatRoomsRef.current?.();
            onTabChange('chat');
            setAddressMemberId(null);
        } catch (error) {
            if (isAnomalyBlockedError(error)) {
                setChatUsersError(null);
                return;
            }
            setChatUsersError(toErrorMessage(error, '채팅방을 만들지 못했습니다.'));
        } finally {
            setIsCreatingDirectRoom(false);
        }
    }, [ensureChatRoomInList, isCreatingDirectRoom, onTabChange, selectedAddressMember, user?.id]);

    const handleAddressBack = () => {
        setChatUsersError(null);
        setAddressMemberId(null);
    };

    const handleChatRoomBack = () => {
        setChatError(null);
        setSelectedChatRoomId(null);
        clearChatImageSelection();
        stopTyping();
    };

    useEffect(() => {
        if (!isOpen || activeTab !== 'chat' || !selectedChatRoomId) {
            return;
        }

        markChatRoomAsRead(selectedChatRoomId);
    }, [activeTab, isOpen, markChatRoomAsRead, selectedChatRoomId]);

    useEffect(() => {
        if (!chatScrollContainerRef.current) {
            return;
        }

        chatScrollContainerRef.current.scrollTop = chatScrollContainerRef.current.scrollHeight;
    }, [chatMessages, typingSummary, isChatLoading]);

    useEffect(() => {
        return () => {
            stopTyping();
            clearTypingTimers();
            clearChatImageSelection();
            if (chatChannelRef.current) {
                void supabase.removeChannel(chatChannelRef.current);
                chatChannelRef.current = null;
            }
            if (unreadMessagesChannelRef.current) {
                void supabase.removeChannel(unreadMessagesChannelRef.current);
                unreadMessagesChannelRef.current = null;
            }
            if (chatPresenceChannelRef.current) {
                void supabase.removeChannel(chatPresenceChannelRef.current);
                chatPresenceChannelRef.current = null;
            }
            if (chatRoomMembershipChannelRef.current) {
                void supabase.removeChannel(chatRoomMembershipChannelRef.current);
                chatRoomMembershipChannelRef.current = null;
            }
        };
    }, [clearChatImageSelection, clearTypingTimers, stopTyping]);

    return (
        <aside
            className={clsx(
                'fixed right-0 top-16 bottom-0 z-40 w-80 border-l border-gray-200 bg-white shadow-lg transition-transform duration-300',
                isOpen ? 'translate-x-0' : 'translate-x-full'
            )}
            aria-hidden={!isOpen}
        >
            <div className="flex items-center border-b border-gray-100 px-4 py-3">
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => onTabChange('notifications')}
                        className={clsx(
                            'flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-sm',
                            activeTab === 'notifications'
                                ? 'bg-[#F8F6F2] text-[#41322A]'
                                : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
                        )}
                    >
                        <Bell className="h-4 w-4" />
                        <span>알림</span>
                        {unreadCount > 0 && (
                            <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-600">
                                {formatSidebarCountBadge(unreadCount)}
                            </span>
                        )}
                    </button>
                    <button
                        type="button"
                        onClick={() => onTabChange('address')}
                        className={clsx(
                            'flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-sm',
                            activeTab === 'address'
                                ? 'bg-[#F8F6F2] text-[#41322A]'
                                : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
                        )}
                    >
                        <UsersRound className="h-4 w-4" />
                        <span>멤버</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            if (activeTab !== 'chat') {
                                setSelectedChatRoomId(null);
                            }
                            onTabChange('chat');
                        }}
                        className={clsx(
                            'flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-sm',
                            activeTab === 'chat'
                                ? 'bg-[#F8F6F2] text-[#41322A]'
                                : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
                        )}
                    >
                        <MessageSquare className="h-4 w-4" />
                        <span>채팅</span>
                        {unreadChatCount > 0 && (
                            <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-600">
                                {formatSidebarCountBadge(unreadChatCount)}
                            </span>
                        )}
                    </button>
                </div>
            </div>

            <div className="h-[calc(100%-57px)]">
                {activeTab === 'notifications' ? (
                    <div className="flex h-full flex-col overflow-hidden p-3">
                        {!isAuthenticated ? (
                            <div className="flex flex-1 items-center justify-center px-3 text-sm text-gray-700">
                                알림을 보려면 로그인이 필요합니다.{' '}
                                <Link href="/login" className="font-semibold text-[#41322A] underline">
                                    로그인
                                </Link>
                            </div>
                        ) : isNotificationsLoading ? (
                            <>
                                <ListHeader title="읽지않은 알림" count={unreadCount} />
                                <div className="flex flex-1 items-center justify-center gap-2 text-sm text-gray-600">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    알림을 불러오는 중입니다.
                                </div>
                            </>
                        ) : notificationsError ? (
                            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                                <ListHeader title="읽지않은 알림" count={unreadCount} />
                                [error] {notificationsError}
                            </div>
                        ) : (
                            <>
                                <ListHeader title="읽지않은 알림" count={unreadCount} />
                                {notifications.length === 0 ? (
                                    <div className="flex flex-1 items-center justify-center px-3 text-sm text-gray-600">
                                        현재 알림이 없습니다.
                                    </div>
                                ) : (
                                    <ul className="space-y-2">
                                        {notifications.map((notification) => (
                                            <li
                                                key={notification.id}
                                                className={clsx(
                                                    'rounded-lg border p-3',
                                                    notification.isRead ? 'border-gray-200 bg-white' : 'border-[#E2C5B5] bg-[#FFF8F4]'
                                                )}
                                            >
                                                <div className="mb-1 flex items-center justify-between gap-2">
                                                    <span className="text-xs font-semibold text-[#85523A]">
                                                        {getNotificationTypeLabel(notification.type)}
                                                    </span>
                                                    <span className="text-[11px] text-gray-500">
                                                        {formatDateTime(notification.createdAt)}
                                                    </span>
                                                </div>
                                                <p className="text-sm text-gray-800">{notification.message}</p>
                                                <div className="mt-2 flex items-center gap-2">
                                                    {!notification.isRead && (
                                                        <button
                                                            type="button"
                                                            onClick={() => void handleMarkRead(notification)}
                                                            disabled={markingNotificationId === notification.id}
                                                            className="rounded-md border border-[#E2C5B5] px-2 py-1 text-xs text-[#85523A] hover:bg-[#FFF0E8] disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
                                                        >
                                                            {markingNotificationId === notification.id ? '처리 중...' : '읽음 처리'}
                                                        </button>
                                                    )}
                                                    <button
                                                        type="button"
                                                        onClick={() => void handleDeleteNotification(notification)}
                                                        disabled={markingNotificationId === notification.id}
                                                        className="rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
                                                    >
                                                        {markingNotificationId === notification.id ? '처리 중...' : '지우기'}
                                                    </button>
                                                    {notification.type === 'PROJECT_INVITED' &&
                                                        notification.relatedInvitationId &&
                                                        notification.projectId ? (
                                                        <button
                                                            type="button"
                                                            onClick={() => void handleAcceptInvitationAndMoveProject(notification)}
                                                            disabled={markingNotificationId === notification.id}
                                                            className="rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
                                                        >
                                                            {markingNotificationId === notification.id ? '처리 중...' : '수락 후 프로젝트 이동'}
                                                        </button>
                                                    ) : notification.projectId ? (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleMoveProject(notification)}
                                                            className="rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 cursor-pointer"
                                                        >
                                                            프로젝트로 이동
                                                        </button>
                                                    ) : null}
                                                </div>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </>
                        )}
                    </div>
                ) : activeTab === 'address' ? (
                    <div className="flex h-full flex-col overflow-hidden p-3">
                        {!isAuthenticated ? (
                            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
                                주소록을 보려면 로그인이 필요합니다.{' '}
                                <Link href="/login" className="font-semibold text-[#41322A] underline">
                                    로그인
                                </Link>
                            </div>
                        ) : addressPanelMode === 'list' ? (
                            <>
                                <ListHeader title="총 멤버 수" count={chatUsers.length} />
                                {isChatUsersLoading ? (
                                    <div className="flex flex-1 items-center justify-center gap-2 text-sm text-gray-600">
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        주소록을 불러오는 중입니다.
                                    </div>
                                ) : chatUsersError ? (
                                    <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                                        [error] {chatUsersError}
                                    </div>
                                ) : chatUsers.length === 0 ? (
                                    <div className="flex flex-1 items-center justify-center px-3 text-center text-sm text-gray-600">
                                        가입된 사용자가 없습니다.
                                    </div>
                                ) : (
                                    <ul className="space-y-2">
                                        {chatUsers.map((chatUser) => {
                                            const isOnline = onlineUserIdSet.has(chatUser.userId);
                                            return (
                                                <li key={chatUser.userId}>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setChatUsersError(null);
                                                            setAddressMemberId(chatUser.userId);
                                                        }}
                                                        className="w-full rounded-lg border border-gray-200 p-3 text-left hover:bg-gray-50 cursor-pointer"
                                                    >
                                                        <div className="mb-2 flex items-center gap-2">
                                                            <img
                                                                src={getProfileAvatarUrl(chatUser.avatarUrl)}
                                                                alt="프로필"
                                                                className="h-8 w-8 rounded-full border border-[#F1D2D7] object-cover"
                                                            />
                                                            <div className="flex-1 min-w-0">
                                                                <p className="text-sm font-semibold text-gray-900 truncate">
                                                                    {chatUser.displayName}
                                                                </p>
                                                                <p className="text-xs text-gray-500 truncate">{chatUser.email}</p>
                                                                {user?.id === chatUser.userId && (
                                                                    <p className="text-[11px] text-[#7B4B36]">내 계정</p>
                                                                )}
                                                            </div>
                                                            <span
                                                                className={clsx(
                                                                    'inline-block h-2.5 w-2.5 rounded-full',
                                                                    isOnline ? 'bg-green-500' : 'bg-gray-300'
                                                                )}
                                                                aria-hidden="true"
                                                            />
                                                        </div>
                                                        {chatUser.phoneNumber ? (
                                                            <p className="text-xs text-gray-500">{chatUser.phoneNumber}</p>
                                                        ) : null}
                                                    </button>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                )}
                            </>
                        ) : (
                            selectedAddressMember && (
                                <div className="flex h-full flex-col">
                                    <div className="mb-3 flex items-center justify-between">
                                        <button
                                            type="button"
                                            onClick={handleAddressBack}
                                            className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-800 cursor-pointer"
                                        >
                                            <ArrowLeft className="h-4 w-4" />
                                            뒤로가기
                                        </button>
                                    </div>

                                    <div className="rounded-lg border border-gray-200 p-4 bg-white">
                                        <div className="flex items-center gap-3">
                                            <img
                                                src={getProfileAvatarUrl(selectedAddressMember.avatarUrl)}
                                                alt="회원 프로필"
                                                className="h-12 w-12 rounded-full border border-[#F1D2D7] object-cover"
                                            />
                                            <div className="min-w-0 flex-1">
                                                <p className="font-semibold text-gray-900 truncate">{selectedAddressMember.displayName}</p>
                                                <p className="mt-0.5 text-xs text-gray-500 truncate">{selectedAddressMember.email}</p>
                                                <p className="mt-1 text-xs text-gray-500">
                                                    {onlineUserIdSet.has(selectedAddressMember.userId) ? '온라인' : '오프라인'}
                                                </p>
                                            </div>
                                        </div>

                                        {selectedAddressMember.phoneNumber ? (
                                            <p className="mt-3 text-sm text-gray-700">
                                                전화번호: <span className="font-semibold">{selectedAddressMember.phoneNumber}</span>
                                            </p>
                                        ) : null}

                                        {!isSelectedAddressMemberSelf ? (
                                            <button
                                                type="button"
                                                onClick={() => void handleChatWithAddressMember()}
                                                disabled={isCreatingDirectRoom}
                                                className={clsx(
                                                    'mt-4 w-full rounded-lg bg-[#7B4B36] py-2 text-sm font-semibold text-white hover:bg-[#6A3F2E]',
                                                    isCreatingDirectRoom
                                                        ? 'cursor-not-allowed opacity-70'
                                                        : 'cursor-pointer'
                                                )}
                                            >
                                                {isCreatingDirectRoom ? '채팅방 여는 중...' : '채팅하기'}
                                            </button>
                                        ) : (
                                            <p className="mt-4 text-center text-xs text-gray-500">
                                                내 계정에는 채팅을 시작할 수 없습니다.
                                            </p>
                                        )}
                                        {chatUsersError && (
                                            <p className="mt-2 rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-700">
                                                [error] {chatUsersError}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            )
                        )}
                    </div>
                ) : (
                    <div className="flex h-full flex-col overflow-hidden p-3">
                        {!isAuthenticated ? (
                            <div className="flex flex-1 items-center justify-center px-3 text-sm text-gray-700">
                                채팅을 이용하려면 로그인이 필요합니다.{' '}
                                <Link href="/login" className="font-semibold text-[#41322A] underline">
                                    로그인
                                </Link>
                            </div>
                        ) : isChatRoomsLoading ? (
                            <div className="flex flex-1 items-center justify-center gap-2 text-sm text-gray-600">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                채팅방을 불러오는 중입니다.
                            </div>
                        ) : chatRoomsError ? (
                            <div className="flex flex-1 items-center justify-center px-3 text-sm text-red-700">
                                [error] {chatRoomsError}
                            </div>
                        ) : chatRooms.length === 0 ? (
                            <div className="flex flex-1 items-center justify-center px-3 text-sm text-gray-600">
                                현재 참여 중인 채팅방이 없습니다.
                            </div>
                        ) : (
                            <div className="flex h-full min-h-0 flex-1 flex-col">
                                {selectedRoom ? (
                                    <div className="flex h-full min-h-0 flex-1 flex-col">
                                        <div className="flex h-[50px] shrink-0 items-center border-b border-gray-100">
                                            <button
                                                type="button"
                                                onClick={handleChatRoomBack}
                                                className="inline-flex cursor-pointer items-center gap-1 text-sm text-gray-600 hover:text-gray-800"
                                            >
                                                <ArrowLeft className="h-4 w-4" />
                                                뒤로가기
                                            </button>
                                        </div>
                                        <div className="flex h-[30px] shrink-0 items-center border-b border-gray-100">
                                            <div className="truncate text-sm font-semibold text-gray-900">{selectedRoom.title}</div>
                                        </div>

                                        <div ref={chatScrollContainerRef} className="min-h-0 flex-1 overflow-y-auto py-2 pr-1">
                                            {isChatLoading ? (
                                                <div className="flex h-full items-center justify-center gap-2 text-sm text-gray-600">
                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                    채팅방을 불러오는 중입니다.
                                                </div>
                                            ) : chatError ? (
                                                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                                                    [error] {chatError}
                                                </div>
                                            ) : chatMessages.length === 0 ? (
                                                <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">
                                                    아직 채팅 메시지가 없습니다.
                                                </div>
                                            ) : (
                                                <div className="space-y-2">
                                                    {chatMessages.map((message) => {
                                                        const isMyMessage = message.senderUserId === user?.id;
                                                        return (
                                                            <div
                                                                key={message.id}
                                                                className={clsx('flex', isMyMessage ? 'justify-end' : 'justify-start')}
                                                            >
                                                                <div
                                                                    className={clsx(
                                                                        'max-w-[90%] rounded-xl px-3 py-2',
                                                                        isMyMessage ? 'bg-[#7B4B36] text-white' : 'bg-gray-100 text-gray-900'
                                                                    )}
                                                                >
                                                                    {!isMyMessage && (
                                                                        <div className="mb-1 text-[11px] font-semibold opacity-80">
                                                                            {message.senderName}
                                                                        </div>
                                                                    )}
                                                                    {message.imageUrl && (
                                                                        <a href={message.imageUrl} target="_blank" rel="noreferrer" className="mb-1 block overflow-hidden rounded-md">
                                                                            <img
                                                                                src={message.imageUrl}
                                                                                alt={message.imageOriginalFilename || '채팅 이미지'}
                                                                                className="max-h-60 w-full object-cover"
                                                                            />
                                                                        </a>
                                                                    )}
                                                                    {message.body && (
                                                                        <p className="whitespace-pre-wrap break-words text-sm">{message.body}</p>
                                                                    )}
                                                                    <div className="mt-1 text-[10px] opacity-70">
                                                                        {formatDateTime(message.createdAt)}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>

                                        <div className="shrink-0 border-t border-gray-100">
                                            {typingSummary ? (
                                                <div className="mb-1 shrink-0 text-xs text-gray-500">{typingSummary}</div>
                                            ) : null}
                                            {chatImagePreviewUrl && (
                                                <div className="mb-2 shrink-0 rounded-lg border border-gray-200 p-2">
                                                    <img src={chatImagePreviewUrl} alt="전송 이미지 미리보기" className="max-h-20 w-full rounded-md object-cover" />
                                                    <div className="mt-1.5 flex justify-end">
                                                        <button
                                                            type="button"
                                                            onClick={handleChatImageRemove}
                                                            className="inline-flex h-8 cursor-pointer items-center gap-1 whitespace-nowrap rounded-md border border-red-100 px-2.5 text-xs font-medium leading-none text-red-500 hover:bg-red-50"
                                                        >
                                                            <X className="h-3 w-3" />
                                                            이미지 제거
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                                                <div className="flex min-w-0 flex-1 items-center gap-2">
                                                    <label
                                                        htmlFor="chat-image-input"
                                                        className="inline-flex h-14 w-14 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
                                                        title="이미지 첨부"
                                                    >
                                                        <ImagePlus className="h-4 w-4" />
                                                    </label>
                                                    <input
                                                        id="chat-image-input"
                                                        type="file"
                                                        accept="image/*"
                                                        onChange={handleChatImageChange}
                                                        className="hidden"
                                                    />
                                                    <textarea
                                                        value={chatInput}
                                                        onChange={handleChatInputChange}
                                                        onKeyDown={handleChatInputKeyDown}
                                                        rows={1}
                                                        placeholder="메시지를 입력하세요"
                                                        className="hide-scrollbar h-14 min-h-14 max-h-14 flex-1 resize-none overflow-y-auto rounded-lg border border-gray-200 px-3 py-3 text-sm leading-5 text-black placeholder:text-gray-400 focus:border-[#D9A88B] focus:outline-none"
                                                    />
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => void handleSendChatMessage()}
                                                    disabled={(!chatInput.trim() && !chatImageFile) || isSendingChatMessage}
                                                    className="inline-flex h-14 w-full min-w-[100px] shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-[#7B4B36] px-4 text-[13px] font-semibold leading-none text-white hover:bg-[#6A3F2E] disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer sm:w-auto"
                                                >
                                                    {isSendingChatMessage ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                                                    <span className="leading-none">{isSendingChatMessage ? '전송 중' : '전송'}</span>
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                                        <div className="space-y-2">
                                            {chatRooms.map((chatRoom) => (
                                                <button
                                                    key={chatRoom.id}
                                                    type="button"
                                                    onClick={() => handleChatRoomSelect(chatRoom.id)}
                                                    className="w-full cursor-pointer rounded-lg border border-gray-200 bg-white px-3 py-2 text-left hover:bg-gray-50"
                                                >
                                                    <div className="text-sm font-medium text-gray-900">{chatRoom.title}</div>
                                                    <div className="text-[11px] text-gray-500">
                                                        {chatRoom.roomType === 'direct' ? '1:1 채팅' : '공개 채팅'}
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </aside>
    );
};
