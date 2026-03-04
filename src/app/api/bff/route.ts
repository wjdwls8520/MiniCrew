import { NextResponse } from 'next/server';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { getProfileAvatarUrl } from '@/lib/profileAvatar';
import { enforceRateLimit, sanitizeInput } from '@/lib/server/security';
import { getAuthUserFromRequest, createServiceRoleClient } from '@/lib/server/supabaseRoute';

const PROJECT_SELECT = [
    'id',
    'name',
    'description',
    'members_count',
    'status',
    'start_date',
    'end_date',
    'category',
    'theme_color',
    'tags',
    'visibility',
    'created_by',
    'created_at',
].join(',');

const USER_PROFILE_SELECT = [
    'id',
    'user_id',
    'email',
    'full_name',
    'nickname',
    'phone_number',
    'avatar_url',
    'avatar_original_filename',
    'avatar_stored_filename',
    'avatar_storage_path',
    'avatar_size_bytes',
    'created_at',
    'updated_at',
].join(',');

const CHAT_ROOM_SELECT = 'id,slug,title,room_type';
const CHAT_MESSAGE_SELECT = [
    'id',
    'room_id',
    'sender_user_id',
    'sender_name',
    'body',
    'image_url',
    'image_original_filename',
    'image_stored_filename',
    'image_storage_path',
    'image_size_bytes',
    'created_at',
].join(',');

const BOARD_SELECT = [
    'id',
    'item_type',
    'title',
    'content',
    'image_url',
    'image_original_filename',
    'image_stored_filename',
    'image_storage_path',
    'image_size_bytes',
    'status',
    'priority',
    'progress',
    'category',
    'start_date',
    'end_date',
    'author_name',
    'author_id',
    'project_id',
    'created_at',
    'comment_count',
    'project_item_assignees ( member_id, project_members ( id, display_name, user_id ) )',
].join(',');

const ITEM_ATTACHMENT_MAX_COUNT = 5;
const ITEM_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;

const TASK_STATUS_VALUES = new Set([
    'REQUEST',
    'PROGRESS',
    'FEEDBACK',
    'REVIEW',
    'DONE',
    'HOLD',
    'ISSUE',
]);

const TASK_STATUS_LABELS: Record<string, string> = {
    REQUEST: '요청',
    PROGRESS: '진행',
    FEEDBACK: '피드백',
    REVIEW: '검수완료',
    DONE: '완료',
    HOLD: '보류',
    ISSUE: '이슈',
};

const ADMIN_USER_IDS = new Set(
    (process.env.NEXT_PUBLIC_MINICREW_ADMIN_USER_IDS ?? '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)
);

const ADMIN_EMAILS = new Set(
    (process.env.NEXT_PUBLIC_MINICREW_ADMIN_EMAILS ?? '')
        .split(',')
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean)
);

function normalizeText(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function normalizeEmail(value: unknown): string {
    return normalizeText(value).toLowerCase();
}

function normalizeDate(value: unknown): string | null {
    const normalized = normalizeText(value);
    return normalized || null;
}

function normalizeOptionalText(value: unknown): string | null {
    const normalized = normalizeText(value);
    return normalized || null;
}

function normalizeOptionalNumber(value: unknown): number | null {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return null;
    }
    if (value <= 0) {
        return null;
    }
    return Math.floor(value);
}

function normalizeTaskStatus(value: unknown): string {
    const normalized = normalizeText(value).toUpperCase();
    if (TASK_STATUS_VALUES.has(normalized)) {
        return normalized;
    }
    return 'REQUEST';
}

function normalizeTaskProgress(value: unknown): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return 0;
    }
    const rounded = Math.round(value);
    if (rounded < 0) {
        return 0;
    }
    if (rounded > 100) {
        return 100;
    }
    return rounded;
}

function getTaskStatusLabel(status: string): string {
    return TASK_STATUS_LABELS[status] ?? status;
}

function ensureDateRange(startDate: string | null, endDate: string | null): void {
    if (startDate && endDate && startDate > endDate) {
        throw new Error('종료일은 시작일보다 빠를 수 없습니다.');
    }
}

function requireAuthUser(user: User | null): User {
    if (!user) {
        throw new Error('로그인이 필요합니다.');
    }
    return user;
}

const PROFILE_BYPASS_ACTIONS = new Set([
    'auth.getUserProfile',
    'auth.upsertUserProfile',
]);

async function ensureOnboardedUser(
    supabase: SupabaseClient,
    action: string,
    user: User | null
): Promise<void> {
    if (!user) {
        return;
    }
    if (PROFILE_BYPASS_ACTIONS.has(action)) {
        return;
    }

    const { data, error } = await supabase
        .from('user_profiles')
        .select('user_id')
        .eq('user_id', user.id)
        .maybeSingle();

    if (error) {
        throw new Error(error.message);
    }
    if (!data) {
        throw new Error('회원가입을 완료해 주세요.');
    }
}

function toProjectItem(row: Record<string, unknown>, isFavorite = false) {
    return {
        id: String(row.id ?? ''),
        name: String(row.name ?? ''),
        description: String(row.description ?? ''),
        members: typeof row.members_count === 'number' ? row.members_count : 0,
        startDate: String(row.start_date ?? ''),
        endDate: String(row.end_date ?? ''),
        isFavorite,
        category: String(row.category ?? '미분류'),
        themeColor: String(row.theme_color ?? '#B95D69'),
        tags: Array.isArray(row.tags) ? row.tags.map((tag) => String(tag)) : [],
        visibility: row.visibility === 'public' ? 'public' : 'private',
        status: normalizeTaskStatus(row.status),
        createdBy: row.created_by ? String(row.created_by) : null,
        createdAt: String(row.created_at ?? ''),
    } as const;
}

function toUserProfile(row: Record<string, unknown>) {
    return {
        id: String(row.id ?? ''),
        userId: String(row.user_id ?? ''),
        email: String(row.email ?? ''),
        fullName: String(row.full_name ?? ''),
        nickname: String(row.nickname ?? ''),
        phoneNumber: String(row.phone_number ?? ''),
        avatarUrl: getProfileAvatarUrl(normalizeOptionalText(row.avatar_url)),
        avatarOriginalFilename: normalizeOptionalText(row.avatar_original_filename),
        avatarStoredFilename: normalizeOptionalText(row.avatar_stored_filename),
        avatarStoragePath: normalizeOptionalText(row.avatar_storage_path),
        avatarSizeBytes: normalizeOptionalNumber(row.avatar_size_bytes),
        createdAt: String(row.created_at ?? ''),
        updatedAt: String(row.updated_at ?? ''),
    } as const;
}

function toProjectMember(row: Record<string, unknown>) {
    return {
        id: String(row.id ?? ''),
        projectId: String(row.project_id ?? ''),
        name: String(row.display_name ?? ''),
        email: normalizeOptionalText(row.email),
        userId: normalizeOptionalText(row.user_id),
        role: row.role === 'leader' ? 'leader' : 'member',
        createdAt: String(row.created_at ?? ''),
    } as const;
}

function toProjectInvitation(row: Record<string, unknown>) {
    return {
        id: String(row.id ?? ''),
        projectId: String(row.project_id ?? ''),
        projectName: undefined,
        inviteeName: String(row.invitee_name ?? ''),
        inviteeEmail: String(row.invitee_email ?? ''),
        inviterId: normalizeOptionalText(row.inviter_user_id),
        inviteeId: normalizeOptionalText(row.invitee_user_id),
        role: row.role === 'leader' ? 'leader' : 'member',
        status: String(row.status ?? 'PENDING'),
        message: String(row.message ?? ''),
        invitedByName: String(row.invited_by_name ?? ''),
        createdAt: String(row.created_at ?? ''),
        respondedAt: normalizeOptionalText(row.responded_at),
    } as const;
}

function toProjectJoinRequest(row: Record<string, unknown>) {
    return {
        id: String(row.id ?? ''),
        projectId: String(row.project_id ?? ''),
        requesterName: String(row.requester_name ?? ''),
        requesterEmail: String(row.requester_email ?? ''),
        message: String(row.message ?? ''),
        status: String(row.status ?? 'PENDING'),
        reviewedByName: normalizeOptionalText(row.reviewed_by_name),
        createdAt: String(row.created_at ?? ''),
        reviewedAt: normalizeOptionalText(row.reviewed_at),
    } as const;
}

function toProjectNotification(row: Record<string, unknown>) {
    return {
        id: String(row.id ?? ''),
        recipientId: String(row.recipient_user_id ?? ''),
        actorId: normalizeOptionalText(row.actor_user_id),
        projectId: normalizeOptionalText(row.project_id),
        relatedInvitationId: normalizeOptionalText(row.related_invitation_id),
        relatedRequestId: normalizeOptionalText(row.related_request_id),
        type: String(row.type ?? ''),
        message: String(row.message ?? ''),
        isRead: Boolean(row.is_read),
        createdAt: String(row.created_at ?? ''),
    } as const;
}

function toTask(row: Record<string, unknown>) {
    const assigneesRaw = Array.isArray(row.project_item_assignees) ? row.project_item_assignees : [];
    const assignees = assigneesRaw
        .map((item) => (item as { project_members?: { id?: string; display_name?: string; user_id?: string | null } }).project_members)
        .filter((member): member is { id: string; display_name?: string; user_id?: string | null } => Boolean(member?.id))
        .map((member) => ({
            id: member.id,
            name: normalizeText(member.display_name) || '이름없음',
            userId: member.user_id ?? null,
        }));

    const attachmentsRaw = Array.isArray(row.project_item_attachments) ? row.project_item_attachments : [];
    const attachments = attachmentsRaw
        .map((entry) => entry as Record<string, unknown>)
        .filter((entry) => normalizeOptionalText(entry.storage_path))
        .map((entry) => ({
            id: String(entry.id ?? ''),
            fileUrl: normalizeOptionalText(entry.file_url) ?? '',
            originalFilename: normalizeOptionalText(entry.original_filename) ?? '첨부파일',
            storedFilename: normalizeOptionalText(entry.stored_filename) ?? '',
            storagePath: normalizeOptionalText(entry.storage_path) ?? '',
            fileSizeBytes: normalizeOptionalNumber(entry.file_size_bytes) ?? 0,
            mimeType: normalizeOptionalText(entry.mime_type) ?? 'application/octet-stream',
            createdAt: String(entry.created_at ?? ''),
        }));

    return {
        id: String(row.id ?? ''),
        type: 'TASK',
        title: String(row.title ?? ''),
        content: String(row.content ?? ''),
        imageUrl: normalizeOptionalText(row.image_url),
        imageOriginalFilename: normalizeOptionalText(row.image_original_filename),
        imageStoredFilename: normalizeOptionalText(row.image_stored_filename),
        imageStoragePath: normalizeOptionalText(row.image_storage_path),
        imageSizeBytes: normalizeOptionalNumber(row.image_size_bytes),
        attachments,
        status: String(row.status ?? 'REQUEST'),
        priority: String(row.priority ?? 'NORMAL'),
        progress: typeof row.progress === 'number' ? Math.max(0, Math.min(100, row.progress)) : 0,
        category: normalizeText(row.category) || 'PLANNING',
        startDate: String(row.start_date ?? ''),
        endDate: String(row.end_date ?? ''),
        assignees,
        author: {
            id: normalizeText(row.author_id) || 'anonymous',
            name: normalizeText(row.author_name) || '익명',
        },
        createdAt: String(row.created_at ?? '').split('T')[0],
        commentCount: typeof row.comment_count === 'number' ? row.comment_count : 0,
    } as const;
}

function toPost(row: Record<string, unknown>) {
    const assigneesRaw = Array.isArray(row.project_item_assignees) ? row.project_item_assignees : [];
    const assignees = assigneesRaw
        .map((item) => (item as { project_members?: { id?: string; display_name?: string; user_id?: string | null } }).project_members)
        .filter((member): member is { id: string; display_name?: string; user_id?: string | null } => Boolean(member?.id))
        .map((member) => ({
            id: member.id,
            name: normalizeText(member.display_name) || '이름없음',
            userId: member.user_id ?? null,
        }));
    const attachmentsRaw = Array.isArray(row.project_item_attachments) ? row.project_item_attachments : [];
    const attachments = attachmentsRaw
        .map((entry) => entry as Record<string, unknown>)
        .filter((entry) => normalizeOptionalText(entry.storage_path))
        .map((entry) => ({
            id: String(entry.id ?? ''),
            fileUrl: normalizeOptionalText(entry.file_url) ?? '',
            originalFilename: normalizeOptionalText(entry.original_filename) ?? '첨부파일',
            storedFilename: normalizeOptionalText(entry.stored_filename) ?? '',
            storagePath: normalizeOptionalText(entry.storage_path) ?? '',
            fileSizeBytes: normalizeOptionalNumber(entry.file_size_bytes) ?? 0,
            mimeType: normalizeOptionalText(entry.mime_type) ?? 'application/octet-stream',
            createdAt: String(entry.created_at ?? ''),
        }));

    return {
        id: String(row.id ?? ''),
        type: 'POST',
        title: String(row.title ?? ''),
        content: String(row.content ?? ''),
        imageUrl: normalizeOptionalText(row.image_url),
        imageOriginalFilename: normalizeOptionalText(row.image_original_filename),
        imageStoredFilename: normalizeOptionalText(row.image_stored_filename),
        imageStoragePath: normalizeOptionalText(row.image_storage_path),
        imageSizeBytes: normalizeOptionalNumber(row.image_size_bytes),
        category: normalizeText(row.category) || 'ALL',
        attachments,
        assignees,
        authorId: normalizeOptionalText(row.author_id),
        author: normalizeText(row.author_name) || '익명',
        createdAt: String(row.created_at ?? '').split('T')[0],
        commentCount: typeof row.comment_count === 'number' ? row.comment_count : 0,
    } as const;
}

function toProjectItemComment(row: Record<string, unknown>) {
    return {
        id: String(row.id ?? ''),
        projectId: String(row.project_id ?? ''),
        itemId: String(row.item_id ?? ''),
        parentCommentId: normalizeOptionalText(row.parent_comment_id),
        authorUserId: normalizeOptionalText(row.author_user_id),
        authorName: normalizeText(row.author_name) || '익명',
        body: String(row.body ?? ''),
        createdAt: String(row.created_at ?? ''),
    } as const;
}

function toChatRoom(row: Record<string, unknown>) {
    return {
        id: String(row.id ?? ''),
        slug: String(row.slug ?? ''),
        title: String(row.title ?? ''),
        roomType: row.room_type === 'public' ? 'public' : 'direct',
    } as const;
}

function toChatMessage(row: Record<string, unknown>) {
    return {
        id: String(row.id ?? ''),
        roomId: String(row.room_id ?? ''),
        senderUserId: String(row.sender_user_id ?? ''),
        senderName: String(row.sender_name ?? ''),
        body: String(row.body ?? ''),
        imageUrl: normalizeOptionalText(row.image_url),
        imageOriginalFilename: normalizeOptionalText(row.image_original_filename),
        imageStoredFilename: normalizeOptionalText(row.image_stored_filename),
        imageStoragePath: normalizeOptionalText(row.image_storage_path),
        imageSizeBytes: normalizeOptionalNumber(row.image_size_bytes),
        createdAt: String(row.created_at ?? ''),
    } as const;
}

function toChatUser(row: Record<string, unknown>) {
    const nickname = normalizeText(row.nickname);
    const fullName = normalizeText(row.full_name);
    const email = String(row.email ?? '');
    const fallbackName = email.includes('@') ? email.split('@')[0] : '사용자';

    return {
        userId: String(row.user_id ?? ''),
        displayName: nickname || fullName || fallbackName,
        fullName: fullName || null,
        nickname: nickname || null,
        email,
        phoneNumber: normalizeText(row.phone_number),
        avatarUrl: normalizeOptionalText(row.avatar_url),
    } as const;
}

async function isSystemAdmin(supabase: SupabaseClient, user: User | null): Promise<boolean> {
    if (!user) {
        return false;
    }

    if (ADMIN_USER_IDS.has(user.id)) {
        return true;
    }

    const userEmail = normalizeEmail(user.email);
    if (userEmail && ADMIN_EMAILS.has(userEmail)) {
        return true;
    }

    const { data } = await supabase
        .from('user_profiles')
        .select('is_admin')
        .eq('user_id', user.id)
        .maybeSingle();

    return Boolean((data as { is_admin?: boolean } | null)?.is_admin);
}

async function getProjectMemberRole(
    supabase: SupabaseClient,
    projectId: string,
    userId?: string | null,
    email?: string | null
): Promise<'leader' | 'member' | null> {
    const filters = [
        userId ? `user_id.eq.${userId}` : '',
        email ? `email.eq.${email.toLowerCase()}` : '',
    ].filter(Boolean);

    if (!projectId || filters.length === 0) {
        return null;
    }

    const { data, error } = await supabase
        .from('project_members')
        .select('role')
        .eq('project_id', projectId)
        .or(filters.join(','))
        .limit(1)
        .maybeSingle();

    if (error || !data) {
        return null;
    }

    return ((data as { role?: string }).role === 'leader' ? 'leader' : 'member') as 'leader' | 'member';
}

async function ensureDirectRoomMembers(supabase: SupabaseClient, roomId: string, userIds: string[]): Promise<void> {
    const uniqueUserIds = Array.from(new Set(userIds.map((id) => id.trim()).filter(Boolean)));
    if (uniqueUserIds.length === 0) {
        return;
    }

    // RLS 정책상 direct room 생성 직후에는 생성자 본인 row를 먼저 넣어야
    // 다른 멤버 row insert 검사에서 room 가시성이 확보됩니다.
    for (const userId of uniqueUserIds) {
        const { error } = await supabase
            .from('chat_room_members')
            .upsert(
                {
                    room_id: roomId,
                    user_id: userId,
                },
                { onConflict: 'room_id,user_id', ignoreDuplicates: true }
            );

        if (error) {
            throw new Error(error.message);
        }
    }
}

async function findDirectRoomByKey(supabase: SupabaseClient, directKey: string): Promise<Record<string, unknown> | null> {
    const { data, error } = await supabase
        .from('chat_rooms')
        .select(CHAT_ROOM_SELECT)
        .eq('room_type', 'direct')
        .eq('direct_key', directKey)
        .maybeSingle();

    if (error) {
        throw new Error(error.message);
    }

    return data ? (data as unknown as Record<string, unknown>) : null;
}

async function findDirectRoomByKeyAsServiceRole(directKey: string): Promise<Record<string, unknown> | null> {
    try {
        const serviceSupabase = createServiceRoleClient();
        const { data, error } = await serviceSupabase
            .from('chat_rooms')
            .select(CHAT_ROOM_SELECT)
            .eq('room_type', 'direct')
            .eq('direct_key', directKey)
            .maybeSingle();

        if (error) {
            throw new Error(error.message);
        }

        return data ? (data as unknown as Record<string, unknown>) : null;
    } catch {
        return null;
    }
}

async function createNotification(supabase: SupabaseClient, params: {
    recipientUserId: string;
    actorUserId?: string | null;
    projectId?: string | null;
    relatedInvitationId?: string | null;
    relatedRequestId?: string | null;
    type: string;
    message: string;
}): Promise<void> {
    const { error } = await supabase
        .from('notifications')
        .insert({
            recipient_user_id: params.recipientUserId,
            actor_user_id: params.actorUserId ?? null,
            project_id: params.projectId ?? null,
            related_invitation_id: params.relatedInvitationId ?? null,
            related_request_id: params.relatedRequestId ?? null,
            type: params.type,
            message: params.message,
            is_read: false,
        });

    if (error) {
        throw new Error(error.message);
    }
}

async function createNotificationsForUsers(
    supabase: SupabaseClient,
    params: {
        recipientUserIds: string[];
        actorUserId?: string | null;
        projectId?: string | null;
        type: string;
        message: string;
    }
): Promise<void> {
    const uniqueRecipientIds = Array.from(new Set(params.recipientUserIds.map((userId) => userId.trim()).filter(Boolean)));
    const actorUserId = normalizeOptionalText(params.actorUserId);

    for (const recipientUserId of uniqueRecipientIds) {
        if (actorUserId && recipientUserId === actorUserId) {
            continue;
        }

        await createNotification(supabase, {
            recipientUserId,
            actorUserId,
            projectId: normalizeOptionalText(params.projectId),
            type: params.type,
            message: params.message,
        });
    }
}

async function listProjectMemberUserIds(
    supabase: SupabaseClient,
    projectId: string
): Promise<string[]> {
    const { data, error } = await supabase
        .from('project_members')
        .select('user_id')
        .eq('project_id', projectId);

    if (error) {
        throw new Error(error.message);
    }

    return Array.from(
        new Set(
            ((data ?? []) as unknown as Record<string, unknown>[])
                .map((row) => normalizeOptionalText(row.user_id))
                .filter((value): value is string => Boolean(value))
        )
    );
}

async function refreshProjectMembersCount(
    supabase: SupabaseClient,
    projectId: string
): Promise<void> {
    const normalizedProjectId = normalizeText(projectId);
    if (!normalizedProjectId) {
        return;
    }

    const { count, error: countError } = await supabase
        .from('project_members')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', normalizedProjectId);

    if (countError) {
        throw new Error(countError.message);
    }

    const nextCount = typeof count === 'number' && Number.isFinite(count) ? count : 0;
    const { error: updateError } = await supabase
        .from('projects')
        .update({ members_count: nextCount })
        .eq('id', normalizedProjectId);

    if (updateError) {
        throw new Error(updateError.message);
    }
}

async function listTaskAssigneeUserIds(
    supabase: SupabaseClient,
    projectId: string,
    itemId: string
): Promise<string[]> {
    const { data, error } = await supabase
        .from('project_item_assignees')
        .select('project_members(user_id)')
        .eq('project_id', projectId)
        .eq('item_id', itemId);

    if (error) {
        throw new Error(error.message);
    }

    return Array.from(
        new Set(
            ((data ?? []) as unknown as Array<{ project_members?: { user_id?: string | null } | Array<{ user_id?: string | null }> | null }>)
                .flatMap((row) => {
                    const relation = row.project_members;
                    if (Array.isArray(relation)) {
                        return relation.map((entry) => normalizeOptionalText(entry?.user_id));
                    }
                    return [normalizeOptionalText(relation?.user_id)];
                })
                .filter((value): value is string => Boolean(value))
        )
    );
}

interface NormalizedItemAttachment {
    fileUrl: string;
    originalFilename: string;
    storedFilename: string;
    storagePath: string;
    fileSizeBytes: number;
    mimeType: string;
}

function normalizeItemAttachmentInput(value: unknown): NormalizedItemAttachment[] {
    if (!Array.isArray(value)) {
        return [];
    }

    if (value.length > ITEM_ATTACHMENT_MAX_COUNT) {
        throw new Error('첨부 파일은 최대 5개까지 등록할 수 있습니다.');
    }

    const normalized: NormalizedItemAttachment[] = [];
    const pathSet = new Set<string>();

    for (const entry of value) {
        const record = (entry as Record<string, unknown>) ?? {};
        const fileUrl = normalizeOptionalText(record.fileUrl);
        const originalFilename = normalizeOptionalText(record.originalFilename);
        const storedFilename = normalizeOptionalText(record.storedFilename);
        const storagePath = normalizeOptionalText(record.storagePath);
        const fileSizeBytes = normalizeOptionalNumber(record.fileSizeBytes);
        const mimeType = normalizeOptionalText(record.mimeType)?.toLowerCase();

        if (!fileUrl || !originalFilename || !storedFilename || !storagePath || !fileSizeBytes || !mimeType) {
            throw new Error('첨부 파일 정보가 올바르지 않습니다.');
        }

        if (fileSizeBytes > ITEM_ATTACHMENT_MAX_BYTES) {
            throw new Error('첨부 파일은 10MB 이하여야 합니다.');
        }

        if (pathSet.has(storagePath)) {
            continue;
        }

        pathSet.add(storagePath);
        normalized.push({
            fileUrl,
            originalFilename,
            storedFilename,
            storagePath,
            fileSizeBytes,
            mimeType,
        });
    }

    if (normalized.length > ITEM_ATTACHMENT_MAX_COUNT) {
        throw new Error('첨부 파일은 최대 5개까지 등록할 수 있습니다.');
    }

    return normalized;
}

function getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        return normalizeText(error.message);
    }
    return normalizeText(String(error ?? ''));
}

function mapBoardWriteErrorMessage(rawMessage: string): string {
    const message = normalizeText(rawMessage);
    if (!message) {
        return '작성 데이터 저장에 실패했습니다.';
    }

    if (/project_item_attachments_file_size_bytes_check|file_size_bytes.*check constraint/i.test(message)) {
        return '첨부 파일 스키마가 구버전입니다. `project_item_attachments.file_size_bytes` 제한을 10MB로 마이그레이션해 주세요.';
    }

    if (/project_item_attachments_mime_type_check|mime_type.*check constraint/i.test(message)) {
        return '첨부 파일 스키마가 구버전입니다. `project_item_attachments`의 `mime_type` 제한을 최신 스키마로 마이그레이션해 주세요.';
    }

    if (/permission denied for table project_items|permission denied for table project_item_attachments/i.test(message)) {
        return '데이터베이스 권한 설정이 누락되었습니다. `service_role`에 `project_items/project_item_attachments` 쓰기 권한을 부여해 주세요.';
    }

    return message;
}

async function runAction(args: {
    action: string;
    payload: Record<string, unknown>;
    supabase: SupabaseClient;
    user: User | null;
}) {
    const { action, payload, supabase, user } = args;
    await ensureOnboardedUser(supabase, action, user);

    if (action === 'auth.getUserProfile') {
        const signedUser = requireAuthUser(user);
        const targetUserId = normalizeText(payload.userId);
        if (!targetUserId) {
            return null;
        }

        const canReadAny = await isSystemAdmin(supabase, signedUser);
        if (targetUserId !== signedUser.id && !canReadAny) {
            throw new Error('다른 사용자 프로필에는 접근할 수 없습니다.');
        }

        const { data, error } = await supabase
            .from('user_profiles')
            .select(USER_PROFILE_SELECT)
            .eq('user_id', targetUserId)
            .maybeSingle();

        if (error) {
            throw new Error(error.message);
        }

        if (!data) {
            return null;
        }

        return toUserProfile(data as unknown as Record<string, unknown>);
    }

    if (action === 'auth.upsertUserProfile') {
        const signedUser = requireAuthUser(user);
        const userId = normalizeText(payload.userId);
        const email = normalizeEmail(payload.email);
        const fullName = normalizeText(payload.fullName);
        const nickname = normalizeText(payload.nickname).toLowerCase();
        const phoneNumber = normalizeText(payload.phoneNumber).replace(/[^\d+]/g, '');

        if (userId !== signedUser.id) {
            throw new Error('본인 프로필만 수정할 수 있습니다.');
        }
        if (!nickname || nickname.length > 30) {
            throw new Error('닉네임은 1자 이상 30자 이하여야 합니다.');
        }
        if (!phoneNumber || phoneNumber.length < 8 || phoneNumber.length > 20) {
            throw new Error('전화번호 형식이 올바르지 않습니다.');
        }

        const { data, error } = await supabase
            .from('user_profiles')
            .upsert(
                {
                    user_id: userId,
                    email: email || `${userId}@local`,
                    full_name: fullName || null,
                    nickname,
                    phone_number: phoneNumber,
                    avatar_url: normalizeOptionalText(payload.avatarUrl),
                    avatar_original_filename: normalizeOptionalText(payload.avatarOriginalFilename),
                    avatar_stored_filename: normalizeOptionalText(payload.avatarStoredFilename),
                    avatar_storage_path: normalizeOptionalText(payload.avatarStoragePath),
                    avatar_size_bytes: normalizeOptionalNumber(payload.avatarSizeBytes),
                },
                { onConflict: 'user_id' }
            )
            .select(USER_PROFILE_SELECT)
            .single();

        if (error || !data) {
            throw new Error(error?.message ?? '회원정보 저장에 실패했습니다.');
        }

        return toUserProfile(data as unknown as Record<string, unknown>);
    }

    if (action === 'projects.list') {
        const { data, error } = await supabase
            .from('projects')
            .select(PROJECT_SELECT)
            .order('created_at', { ascending: false });

        if (error) {
            throw new Error(error.message);
        }

        // Fetch user's favorites
        const favoriteProjectIds = new Set<string>();
        if (user) {
            const svc = createServiceRoleClient();
            const { data: favData } = await svc
                .from('project_favorites')
                .select('project_id')
                .eq('user_id', user.id);
            if (favData) {
                for (const fav of favData) {
                    favoriteProjectIds.add(String((fav as Record<string, unknown>).project_id ?? ''));
                }
            }
        }

        return ((data ?? []) as unknown as Record<string, unknown>[]).map((row) =>
            toProjectItem(row, favoriteProjectIds.has(String(row.id ?? '')))
        );
    }

    if (action === 'projects.getById' || action === 'projects.getByIdForViewer') {
        const projectId = normalizeText(payload.projectId);
        if (!projectId) {
            return null;
        }

        const { data, error } = await supabase
            .from('projects')
            .select(PROJECT_SELECT)
            .eq('id', projectId)
            .maybeSingle();

        if (error) {
            throw new Error(error.message);
        }

        if (!data) {
            return null;
        }

        // Check if current user has favorited this project
        let isFav = false;
        if (user) {
            const svc = createServiceRoleClient();
            const { data: favRow } = await svc
                .from('project_favorites')
                .select('id')
                .eq('user_id', user.id)
                .eq('project_id', projectId)
                .maybeSingle();
            isFav = Boolean(favRow);
        }

        return toProjectItem(data as unknown as Record<string, unknown>, isFav);
    }

    if (action === 'projects.addMembers') {
        const signedUser = requireAuthUser(user);
        const projectId = normalizeText(payload.projectId);
        const members = Array.isArray(payload.members) ? payload.members : [];
        if (!projectId || members.length === 0) {
            return null;
        }

        const rows = members
            .map((entry) => ({
                project_id: projectId,
                display_name: normalizeText((entry as Record<string, unknown>).name),
                email: normalizeEmail((entry as Record<string, unknown>).email) || null,
                user_id: normalizeOptionalText((entry as Record<string, unknown>).userId),
                role: (entry as Record<string, unknown>).role === 'leader' ? 'leader' : 'member',
            }))
            .filter((member) => member.display_name);

        if (rows.length === 0) {
            return null;
        }

        const { error } = await supabase.from('project_members').insert(rows);
        if (error && error.code !== '23505') {
            throw new Error(error.message);
        }
        await refreshProjectMembersCount(supabase, projectId);

        // Send notifications to newly added members
        const newMemberUserIds = rows
            .map((row) => row.user_id)
            .filter((uid): uid is string => Boolean(uid) && uid !== signedUser.id);

        if (newMemberUserIds.length > 0) {
            // Fetch project name for the notification message
            const { data: projectRow } = await supabase
                .from('projects')
                .select('name')
                .eq('id', projectId)
                .maybeSingle();
            const projectName = projectRow ? String((projectRow as Record<string, unknown>).name ?? '') : '';

            await createNotificationsForUsers(supabase, {
                recipientUserIds: newMemberUserIds,
                actorUserId: signedUser.id,
                projectId,
                type: 'MEMBER_ADDED',
                message: projectName
                    ? `[${projectName}] 프로젝트에 구성원으로 추가되었습니다.`
                    : '프로젝트에 구성원으로 추가되었습니다.',
            });
        }

        return null;
    }

    if (action === 'projects.create') {
        const signedUser = requireAuthUser(user);
        const input = (payload.input as Record<string, unknown>) ?? {};
        const creator = (payload.creator as Record<string, unknown>) ?? {};
        const creatorUserId = normalizeText(creator.userId);

        if (creatorUserId !== signedUser.id) {
            throw new Error('프로젝트 생성 권한이 없습니다.');
        }

        const name = normalizeText(input.name);
        if (!name) {
            throw new Error('프로젝트 이름을 입력해 주세요.');
        }

        const startDate = normalizeDate(input.startDate);
        const endDate = normalizeDate(input.endDate);
        ensureDateRange(startDate, endDate);

        const tags = Array.isArray(input.tags)
            ? Array.from(new Set(input.tags.map((tag) => normalizeText(tag)).filter(Boolean)))
            : [];

        const description = normalizeText(input.description);
        if (!description) {
            throw new Error('프로젝트 설명을 입력해 주세요.');
        }

        const insertPayload = {
            name,
            description,
            members_count: 0,
            start_date: startDate,
            end_date: endDate,
            category: normalizeText(input.category) || '미분류',
            theme_color: normalizeText(input.themeColor) || '#B95D69',
            tags,
            visibility: normalizeText(input.visibility) === 'public' ? 'public' : 'private',
            status: normalizeTaskStatus(input.status),
            created_by: signedUser.id,
        };

        // INSERT와 SELECT를 분리합니다.
        // PostgREST에서 INSERT + return=representation 조합 시
        // SELECT RLS 정책(can_view_project)이 SECURITY DEFINER 컨텍스트에서
        // auth.uid()를 올바르게 해석하지 못하는 문제를 회피합니다.
        const { error: insertError } = await supabase
            .from('projects')
            .insert(insertPayload);

        if (insertError) {
            throw new Error(insertError.message);
        }

        const { data, error } = await supabase
            .from('projects')
            .select(PROJECT_SELECT)
            .eq('created_by', signedUser.id)
            .eq('name', name)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        if (error || !data) {
            throw new Error(error?.message ?? '프로젝트 생성에 실패했습니다.');
        }

        const project = data as unknown as Record<string, unknown>;
        const creatorDisplayName = normalizeText(creator.displayName) || signedUser.id;
        const creatorEmail = normalizeEmail(creator.email ?? signedUser.email ?? '');

        const { error: leaderError } = await supabase.from('project_members').insert({
            project_id: String(project.id),
            display_name: creatorDisplayName,
            email: creatorEmail || null,
            user_id: signedUser.id,
            role: 'leader',
        });

        if (leaderError) {
            throw new Error(leaderError.message);
        }

        await refreshProjectMembersCount(supabase, String(project.id));

        const initialMembers = Array.isArray(input.initialMembers) ? input.initialMembers : [];
        const invitedUserIdSet = new Set<string>();
        for (const member of initialMembers) {
            const memberRecord = (member as Record<string, unknown>) ?? {};
            const inviteeUserId = normalizeText(memberRecord.userId);
            if (!inviteeUserId) {
                throw new Error('초기 초대 멤버 정보가 올바르지 않습니다.');
            }

            if (inviteeUserId === signedUser.id || invitedUserIdSet.has(inviteeUserId)) {
                continue;
            }

            invitedUserIdSet.add(inviteeUserId);

            const { data: inviteeProfile, error: inviteeProfileError } = await supabase
                .from('user_profiles')
                .select('user_id, full_name, nickname, email')
                .eq('user_id', inviteeUserId)
                .maybeSingle();

            if (inviteeProfileError) {
                throw new Error(inviteeProfileError.message);
            }

            const inviteeProfileRow = inviteeProfile as { user_id?: string; full_name?: string; nickname?: string; email?: string } | null;
            const inviteeEmail = normalizeEmail(inviteeProfileRow?.email);
            if (!inviteeProfileRow?.user_id || !inviteeEmail) {
                throw new Error('존재하는 사용자만 초기 초대 멤버로 지정할 수 있습니다.');
            }

            const inviteeName =
                normalizeText(inviteeProfileRow.full_name) ||
                normalizeText(inviteeProfileRow.nickname) ||
                normalizeText(memberRecord.name) ||
                (inviteeEmail.includes('@') ? inviteeEmail.split('@')[0] : '사용자');

            const { data: invitation, error: invitationError } = await supabase
                .from('project_invitations')
                .insert({
                    project_id: String(project.id),
                    invitee_name: inviteeName,
                    invitee_email: inviteeEmail,
                    invitee_user_id: inviteeUserId,
                    inviter_user_id: signedUser.id,
                    role: 'member',
                    status: 'PENDING',
                    invited_by_name: creatorDisplayName,
                })
                .select('id, invitee_user_id')
                .single();

            if (invitationError) {
                if (invitationError.code === '23505') {
                    continue;
                }
                throw new Error(invitationError.message);
            }

            const invitationInviteeUserId = normalizeOptionalText((invitation as Record<string, unknown>)?.invitee_user_id);
            if (invitationInviteeUserId) {
                await createNotification(supabase, {
                    recipientUserId: invitationInviteeUserId,
                    actorUserId: signedUser.id,
                    projectId: String(project.id),
                    relatedInvitationId: String((invitation as Record<string, unknown>).id ?? ''),
                    type: 'PROJECT_INVITED',
                    message: `${String(project.name ?? '프로젝트')}에 초대되었습니다.`,
                });
            }
        }

        return toProjectItem(project);
    }

    if (action === 'projects.update') {
        const signedUser = requireAuthUser(user);
        const projectId = normalizeText(payload.projectId);
        const updates = (payload.updates as Record<string, unknown>) ?? {};

        if (!projectId) {
            throw new Error('프로젝트 정보가 올바르지 않습니다.');
        }

        const nextStartDate = normalizeDate(updates.startDate);
        const nextEndDate = normalizeDate(updates.endDate);
        if (nextStartDate !== null || nextEndDate !== null) {
            ensureDateRange(nextStartDate, nextEndDate);
        }

        const nextPayload: Record<string, unknown> = {};
        let previousStatus: string | null = null;
        let nextStatus: string | null = null;
        let projectNameForNotification = '프로젝트';
        if (typeof updates.name === 'string') {
            const name = normalizeText(updates.name);
            if (!name) {
                throw new Error('프로젝트 이름은 필수입니다.');
            }
            nextPayload.name = name;
        }
        if (typeof updates.description === 'string') {
            const desc = normalizeText(updates.description);
            if (!desc) {
                throw new Error('프로젝트 설명은 필수입니다.');
            }
            nextPayload.description = desc;
        }
        if (typeof updates.category === 'string') {
            nextPayload.category = normalizeText(updates.category) || '미분류';
        }
        if (typeof updates.themeColor === 'string') {
            const color = normalizeText(updates.themeColor);
            if (!/^#(?:[0-9a-fA-F]{3}){1,2}$/.test(color)) {
                throw new Error('컬러 코드는 #000000 형식이어야 합니다.');
            }
            nextPayload.theme_color = color;
        }
        if (typeof updates.startDate === 'string') {
            nextPayload.start_date = nextStartDate;
        }
        if (typeof updates.endDate === 'string') {
            nextPayload.end_date = nextEndDate;
        }
        if (updates.visibility === 'public' || updates.visibility === 'private') {
            nextPayload.visibility = updates.visibility;
        }
        if (Array.isArray(updates.tags)) {
            nextPayload.tags = Array.from(new Set(updates.tags.map((tag) => normalizeText(tag)).filter(Boolean)));
        }
        if (typeof updates.status === 'string') {
            const { data: currentProject, error: currentProjectError } = await supabase
                .from('projects')
                .select('name,status')
                .eq('id', projectId)
                .single();

            if (currentProjectError || !currentProject) {
                throw new Error(currentProjectError?.message ?? '프로젝트 상태 정보를 불러오지 못했습니다.');
            }

            previousStatus = normalizeTaskStatus((currentProject as Record<string, unknown>).status);
            nextStatus = normalizeTaskStatus(updates.status);
            projectNameForNotification = normalizeText((currentProject as Record<string, unknown>).name) || '프로젝트';
            nextPayload.status = nextStatus;
        }

        if (Object.keys(nextPayload).length === 0) {
            throw new Error('변경할 항목이 없습니다.');
        }

        const { data, error } = await supabase
            .from('projects')
            .update(nextPayload)
            .eq('id', projectId)
            .select(PROJECT_SELECT)
            .single();

        if (error || !data) {
            throw new Error(error?.message ?? '프로젝트 수정에 실패했습니다.');
        }

        if (previousStatus && nextStatus && previousStatus !== nextStatus) {
            const recipientUserIds = await listProjectMemberUserIds(supabase, projectId);
            await createNotificationsForUsers(supabase, {
                recipientUserIds,
                actorUserId: signedUser.id,
                projectId,
                type: 'PROJECT_STATUS_CHANGED',
                message: `${projectNameForNotification}프로젝트의 진행상황이 ${getTaskStatusLabel(previousStatus)}에서 -> ${getTaskStatusLabel(nextStatus)}으로 변경되었습니다.`,
            });
        }

        return toProjectItem(data as unknown as Record<string, unknown>);
    }

    if (action === 'projects.delete') {
        const signedUser = requireAuthUser(user);
        const projectId = normalizeText(payload.projectId);
        if (!projectId) {
            throw new Error('프로젝트 정보가 올바르지 않습니다.');
        }

        const isAdmin = await isSystemAdmin(supabase, signedUser);
        const memberRole = await getProjectMemberRole(supabase, projectId, signedUser.id, normalizeEmail(signedUser.email));
        if (!isAdmin && memberRole !== 'leader') {
            throw new Error('프로젝트 삭제는 관리자 또는 팀장만 가능합니다.');
        }

        // Use service role client to bypass RLS (BFF already validates permissions above)
        const serviceClient = createServiceRoleClient();
        const { data, error } = await serviceClient
            .from('projects')
            .delete()
            .eq('id', projectId)
            .select('id')
            .maybeSingle();

        if (error) {
            throw new Error(error.message);
        }
        if (!data) {
            throw new Error('삭제할 프로젝트를 찾지 못했습니다.');
        }
        return null;
    }

    if (action === 'projects.updateFavorite') {
        const signedUser = requireAuthUser(user);
        const projectId = normalizeText(payload.projectId);
        const isFavorite = Boolean(payload.isFavorite);

        const svc = createServiceRoleClient();

        if (isFavorite) {
            // Add favorite
            const { error: insertError } = await svc
                .from('project_favorites')
                .upsert({ user_id: signedUser.id, project_id: projectId }, { onConflict: 'user_id,project_id' });
            if (insertError) {
                throw new Error(insertError.message);
            }
        } else {
            // Remove favorite
            const { error: deleteError } = await svc
                .from('project_favorites')
                .delete()
                .eq('user_id', signedUser.id)
                .eq('project_id', projectId);
            if (deleteError) {
                throw new Error(deleteError.message);
            }
        }

        // Return updated project
        const { data, error } = await supabase
            .from('projects')
            .select(PROJECT_SELECT)
            .eq('id', projectId)
            .single();

        if (error || !data) {
            throw new Error(error?.message ?? '즐겨찾기 상태 변경에 실패했습니다.');
        }

        return toProjectItem(data as unknown as Record<string, unknown>, isFavorite);
    }

    if (action === 'board.listMembers') {
        const projectId = normalizeText(payload.projectId);
        const { data, error } = await supabase
            .from('project_members')
            .select('id,display_name,user_id,email,role')
            .eq('project_id', projectId)
            .order('created_at', { ascending: true });

        if (error) {
            throw new Error(error.message);
        }

        return ((data ?? []) as unknown as Record<string, unknown>[]).map((row) => ({
            id: String(row.id ?? ''),
            name: normalizeText(row.display_name) || '이름없음',
            userId: normalizeOptionalText(row.user_id),
            email: normalizeOptionalText(row.email),
            role: row.role === 'leader' ? 'leader' : 'member',
        }));
    }

    if (action === 'board.listItems') {
        const projectId = normalizeText(payload.projectId);
        const { data, error } = await supabase
            .from('project_items')
            .select(BOARD_SELECT)
            .eq('project_id', projectId)
            .order('created_at', { ascending: false });

        if (error) {
            throw new Error(error.message);
        }

        const rows = (data ?? []) as unknown as Record<string, unknown>[];
        const itemIds = rows
            .map((row) => normalizeText(row.id))
            .filter(Boolean);

        const attachmentsByItemId = new Map<string, Record<string, unknown>[]>();
        if (itemIds.length > 0) {
            const { data: attachmentRows, error: attachmentError } = await supabase
                .from('project_item_attachments')
                .select('id,item_id,file_url,original_filename,stored_filename,storage_path,file_size_bytes,mime_type,created_at')
                .eq('project_id', projectId)
                .in('item_id', itemIds)
                .order('created_at', { ascending: true });

            if (attachmentError) {
                throw new Error(attachmentError.message);
            }

            for (const attachment of (attachmentRows ?? []) as unknown as Record<string, unknown>[]) {
                const itemId = normalizeText(attachment.item_id);
                if (!itemId) {
                    continue;
                }
                const bucket = attachmentsByItemId.get(itemId) ?? [];
                bucket.push(attachment);
                attachmentsByItemId.set(itemId, bucket);
            }
        }

        const rowsWithAttachments: Record<string, unknown>[] = rows.map((row) => {
            const itemId = normalizeText(row.id);
            return {
                ...row,
                project_item_attachments: attachmentsByItemId.get(itemId) ?? [],
            };
        });

        const tasks = rowsWithAttachments.filter((row) => row.item_type === 'TASK').map(toTask);
        const posts = rowsWithAttachments.filter((row) => row.item_type === 'POST').map(toPost);
        return { tasks, posts };
    }

    if (action === 'board.createItem') {
        const signedUser = requireAuthUser(user);
        const projectId = normalizeText(payload.projectId);
        const input = (payload.input as Record<string, unknown>) ?? {};
        const author = (payload.author as Record<string, unknown>) ?? {};
        const writeSupabase = createServiceRoleClient();

        const itemType = normalizeText(input.type) === 'POST' ? 'POST' : 'TASK';
        const title = normalizeText(input.title);
        const content = normalizeText(input.content);
        if (!title || !content) {
            throw new Error('제목과 내용을 모두 입력해 주세요.');
        }

        const memberRole = await getProjectMemberRole(writeSupabase, projectId, signedUser.id, signedUser.email ?? null);
        const isAdmin = await isSystemAdmin(writeSupabase, signedUser);
        if (!memberRole && !isAdmin) {
            throw new Error('프로젝트 멤버만 업무/글을 작성할 수 있습니다.');
        }

        const startDate = normalizeDate(input.startDate);
        const endDate = normalizeDate(input.endDate);
        ensureDateRange(startDate, endDate);
        const itemAttachments = normalizeItemAttachmentInput(input.attachments);

        let createdItemId = '';
        try {
            const { data, error } = await writeSupabase
                .from('project_items')
                .insert({
                    project_id: projectId,
                    item_type: itemType,
                    title,
                    content,
                    image_url: normalizeOptionalText(input.imageUrl),
                    image_original_filename: normalizeOptionalText(input.imageOriginalFilename),
                    image_stored_filename: normalizeOptionalText(input.imageStoredFilename),
                    image_storage_path: normalizeOptionalText(input.imageStoragePath),
                    image_size_bytes: normalizeOptionalNumber(input.imageSizeBytes),
                    status: itemType === 'TASK' ? normalizeTaskStatus(input.status) : null,
                    priority: itemType === 'TASK' ? normalizeText(input.priority) || 'NORMAL' : null,
                    progress: itemType === 'TASK' ? normalizeTaskProgress(input.progress) : null,
                    category: normalizeText(input.category) || 'PLANNING',
                    start_date: itemType === 'TASK' ? startDate : null,
                    end_date: itemType === 'TASK' ? endDate : null,
                    author_name: normalizeText(author.name) || '익명',
                    author_id: signedUser.id,
                    comment_count: 0,
                })
                .select('id')
                .single();

            if (error || !data) {
                throw new Error(error?.message ?? '작성 데이터 저장에 실패했습니다.');
            }

            createdItemId = String((data as Record<string, unknown>).id ?? '');
            if (!createdItemId) {
                throw new Error('작성 데이터 저장에 실패했습니다.');
            }

            if (Array.isArray(input.assignees)) {
                const assigneeIds = Array.from(new Set(input.assignees.map((entry) => normalizeText(entry)).filter(Boolean)));
                if (assigneeIds.length > 0) {
                    const { data: memberRows, error: memberError } = await writeSupabase
                        .from('project_members')
                        .select('id')
                        .eq('project_id', projectId)
                        .in('id', assigneeIds);

                    if (memberError) {
                        throw new Error(memberError.message);
                    }

                    const validIds = new Set((memberRows ?? []).map((member) => String((member as Record<string, unknown>).id)));
                    const filtered = assigneeIds.filter((id) => validIds.has(id));
                    if (filtered.length === 0) {
                        throw new Error('유효한 담당자만 선택해 주세요.');
                    }

                    const { error: assigneeError } = await writeSupabase
                        .from('project_item_assignees')
                        .insert(
                            filtered.map((memberId) => ({
                                project_id: projectId,
                                item_id: createdItemId,
                                member_id: memberId,
                            }))
                        );

                    if (assigneeError) {
                        throw new Error(assigneeError.message);
                    }
                }
            }

            if (itemAttachments.length > 0) {
                const { error: attachmentError } = await writeSupabase
                    .from('project_item_attachments')
                    .insert(
                        itemAttachments.map((attachment) => ({
                            project_id: projectId,
                            item_id: createdItemId,
                            file_url: attachment.fileUrl,
                            original_filename: attachment.originalFilename,
                            stored_filename: attachment.storedFilename,
                            storage_path: attachment.storagePath,
                            file_size_bytes: attachment.fileSizeBytes,
                            mime_type: attachment.mimeType,
                        }))
                    );

                if (attachmentError) {
                    throw new Error(attachmentError.message);
                }
            }
        } catch (writeError) {
            if (createdItemId) {
                await writeSupabase
                    .from('project_items')
                    .delete()
                    .eq('id', createdItemId)
                    .eq('project_id', projectId);
            }
            throw new Error(mapBoardWriteErrorMessage(getErrorMessage(writeError)));
        }

        const { data: projectRow, error: projectRowError } = await writeSupabase
            .from('projects')
            .select('name')
            .eq('id', projectId)
            .maybeSingle();

        if (projectRowError) {
            throw new Error(projectRowError.message);
        }

        const projectName = normalizeText((projectRow as Record<string, unknown> | null)?.name) || '프로젝트';
        const recipientUserIds = await listProjectMemberUserIds(writeSupabase, projectId);
        await createNotificationsForUsers(writeSupabase, {
            recipientUserIds,
            actorUserId: signedUser.id,
            projectId,
            type: itemType === 'TASK' ? 'BOARD_TASK_CREATED' : 'BOARD_POST_CREATED',
            message: `${projectName}프로젝트에 새로운 ${itemType === 'TASK' ? '업무' : '글'}가 생성되었습니다.`,
        });

        return createdItemId;
    }

    if (action === 'board.updateItem') {
        const signedUser = requireAuthUser(user);
        const projectId = normalizeText(payload.projectId);
        const itemId = normalizeText(payload.itemId);
        const input = (payload.input as Record<string, unknown>) ?? {};
        const isMetaOnlyUpdate = Boolean(input.metaOnly);
        const title = normalizeText(input.title);
        const content = normalizeText(input.content);
        const writeSupabase = createServiceRoleClient();

        const { data: itemTypeRow, error: itemTypeError } = await writeSupabase
            .from('project_items')
            .select('item_type,status,progress,title,author_id')
            .eq('id', itemId)
            .eq('project_id', projectId)
            .single();

        if (itemTypeError || !itemTypeRow) {
            throw new Error(itemTypeError?.message ?? '수정 대상이 존재하지 않습니다.');
        }

        const itemType = (itemTypeRow as Record<string, unknown>).item_type === 'POST' ? 'POST' : 'TASK';
        const previousItemStatus = itemType === 'TASK' ? normalizeTaskStatus((itemTypeRow as Record<string, unknown>).status) : null;
        const previousItemProgress = itemType === 'TASK' ? normalizeTaskProgress((itemTypeRow as Record<string, unknown>).progress) : 0;
        const itemAuthorId = normalizeOptionalText((itemTypeRow as Record<string, unknown>).author_id);
        const memberRole = await getProjectMemberRole(writeSupabase, projectId, signedUser.id, signedUser.email ?? null);
        const isAdmin = await isSystemAdmin(writeSupabase, signedUser);
        let isTaskAssignee = false;
        let previousTaskAssigneeUserIds: string[] = [];

        if (itemType === 'TASK') {
            const { data: assigneeRows, error: assigneeRowsError } = await writeSupabase
                .from('project_item_assignees')
                .select('project_members ( user_id )')
                .eq('project_id', projectId)
                .eq('item_id', itemId);

            if (assigneeRowsError) {
                throw new Error(assigneeRowsError.message);
            }

            previousTaskAssigneeUserIds = Array.from(
                new Set(
                    ((assigneeRows ?? []) as Record<string, unknown>[])
                        .flatMap((row) => {
                            const memberRelation = row.project_members;
                            if (Array.isArray(memberRelation)) {
                                return memberRelation.map((entry) => normalizeOptionalText((entry as Record<string, unknown> | null)?.user_id));
                            }
                            return [normalizeOptionalText((memberRelation as Record<string, unknown> | null)?.user_id)];
                        })
                        .filter((value): value is string => Boolean(value))
                )
            );

            isTaskAssignee = previousTaskAssigneeUserIds.includes(signedUser.id);
        }

        const canManageTaskContent = isAdmin || memberRole === 'leader' || itemAuthorId === signedUser.id;
        const canUpdateTaskMeta = canManageTaskContent || memberRole === 'member' || isTaskAssignee;
        const canUpdatePost = isAdmin || memberRole === 'leader' || itemAuthorId === signedUser.id;

        const requestedStatusRaw = normalizeText(input.status).toUpperCase();
        const nextTaskStatus =
            itemType === 'TASK'
                ? (requestedStatusRaw && TASK_STATUS_VALUES.has(requestedStatusRaw)
                    ? requestedStatusRaw
                    : (previousItemStatus ?? 'REQUEST'))
                : null;
        const nextTaskProgress =
            itemType === 'TASK'
                ? (typeof input.progress === 'number'
                    ? normalizeTaskProgress(input.progress)
                    : previousItemProgress)
                : null;
        const itemTitle = normalizeText((itemTypeRow as Record<string, unknown>).title) || '업무';
        const { data: projectRow } = await writeSupabase
            .from('projects')
            .select('name')
            .eq('id', projectId)
            .maybeSingle();
        const projectNameForNotification = normalizeText((projectRow as Record<string, unknown> | null)?.name) || '프로젝트';

        if (itemType === 'TASK' && isMetaOnlyUpdate) {
            if (!canUpdateTaskMeta) {
                throw new Error('업무/글 수정 권한이 없습니다.');
            }

            const { error: metaUpdateError } = await writeSupabase
                .from('project_items')
                .update({
                    status: nextTaskStatus,
                    progress: nextTaskProgress,
                })
                .eq('id', itemId)
                .eq('project_id', projectId);

            if (metaUpdateError) {
                throw new Error(metaUpdateError.message);
            }

            if (previousItemStatus && nextTaskStatus && previousItemStatus !== nextTaskStatus) {
                const assigneeUserIds = await listTaskAssigneeUserIds(writeSupabase, projectId, itemId);
                const recipientUserIds = Array.from(new Set([
                    ...assigneeUserIds.map((userId) => userId.trim()).filter(Boolean),
                    ...(itemAuthorId ? [itemAuthorId] : []),
                ]));

                await createNotificationsForUsers(writeSupabase, {
                    recipientUserIds,
                    actorUserId: signedUser.id,
                    projectId,
                    type: 'TASK_STATUS_CHANGED',
                    message: `${projectNameForNotification}의 ${itemTitle} 업무의 진행 상태가 "${getTaskStatusLabel(nextTaskStatus)}"로 변경되었습니다.`,
                });
            }

            return null;
        }

        if (itemType === 'TASK' && !canManageTaskContent) {
            throw new Error('업무/글 수정 권한이 없습니다.');
        }
        if (itemType === 'POST' && !canUpdatePost) {
            throw new Error('업무/글 수정 권한이 없습니다.');
        }

        if (!title || !content) {
            throw new Error('제목과 내용을 모두 입력해 주세요.');
        }
        const startDate = normalizeDate(input.startDate);
        const endDate = normalizeDate(input.endDate);
        ensureDateRange(startDate, endDate);
        const itemAttachments = normalizeItemAttachmentInput(input.attachments);

        const imagePayload = input.removeImage
            ? {
                image_url: null,
                image_original_filename: null,
                image_stored_filename: null,
                image_storage_path: null,
                image_size_bytes: null,
            }
            : {
                image_url: normalizeOptionalText(input.imageUrl),
                image_original_filename: normalizeOptionalText(input.imageOriginalFilename),
                image_stored_filename: normalizeOptionalText(input.imageStoredFilename),
                image_storage_path: normalizeOptionalText(input.imageStoragePath),
                image_size_bytes: normalizeOptionalNumber(input.imageSizeBytes),
            };

        const updatePayload: Record<string, unknown> = {
            title,
            content,
            category: normalizeText(input.category) || 'PLANNING',
            ...imagePayload,
        };

        if (itemType === 'TASK') {
            updatePayload.status = nextTaskStatus;
            updatePayload.priority = normalizeText(input.priority) || 'NORMAL';
            updatePayload.progress = nextTaskProgress;
            updatePayload.start_date = startDate;
            updatePayload.end_date = endDate;
        }

        const { error } = await writeSupabase
            .from('project_items')
            .update(updatePayload)
            .eq('id', itemId)
            .eq('project_id', projectId);

        if (error) {
            throw new Error(error.message);
        }

        const { error: deleteError } = await writeSupabase
            .from('project_item_assignees')
            .delete()
            .eq('item_id', itemId);

        if (deleteError) {
            throw new Error(deleteError.message);
        }

        const assigneeIds = Array.isArray(input.assignees)
            ? Array.from(new Set(input.assignees.map((entry) => normalizeText(entry)).filter(Boolean)))
            : [];

        if (assigneeIds.length > 0) {
            const { data: memberRows, error: memberError } = await writeSupabase
                .from('project_members')
                .select('id')
                .eq('project_id', projectId)
                .in('id', assigneeIds);

            if (memberError) {
                throw new Error(memberError.message);
            }

            const validIds = new Set((memberRows ?? []).map((member) => String((member as Record<string, unknown>).id)));
            const filtered = assigneeIds.filter((id) => validIds.has(id));
            if (filtered.length > 0) {
                const { error: insertError } = await writeSupabase
                    .from('project_item_assignees')
                    .insert(
                        filtered.map((memberId) => ({
                            project_id: projectId,
                            item_id: itemId,
                            member_id: memberId,
                        }))
                    );

                if (insertError) {
                    throw new Error(insertError.message);
                }
            }
        }

        const { error: deleteAttachmentError } = await writeSupabase
            .from('project_item_attachments')
            .delete()
            .eq('project_id', projectId)
            .eq('item_id', itemId);

        if (deleteAttachmentError) {
            throw new Error(deleteAttachmentError.message);
        }

        if (itemAttachments.length > 0) {
            const { error: insertAttachmentError } = await writeSupabase
                .from('project_item_attachments')
                .insert(
                    itemAttachments.map((attachment) => ({
                        project_id: projectId,
                        item_id: itemId,
                        file_url: attachment.fileUrl,
                        original_filename: attachment.originalFilename,
                        stored_filename: attachment.storedFilename,
                        storage_path: attachment.storagePath,
                        file_size_bytes: attachment.fileSizeBytes,
                        mime_type: attachment.mimeType,
                    }))
                );

            if (insertAttachmentError) {
                throw new Error(insertAttachmentError.message);
            }
        }

        let nextTaskAssigneeUserIds: string[] = [];
        if (itemType === 'TASK') {
            nextTaskAssigneeUserIds = await listTaskAssigneeUserIds(writeSupabase, projectId, itemId);
            const previousAssigneeSet = new Set(previousTaskAssigneeUserIds.map((userId) => userId.trim()).filter(Boolean));
            const addedAssigneeUserIds = nextTaskAssigneeUserIds
                .map((userId) => userId.trim())
                .filter((userId) => userId && !previousAssigneeSet.has(userId));

            if (addedAssigneeUserIds.length > 0) {
                await createNotificationsForUsers(writeSupabase, {
                    recipientUserIds: addedAssigneeUserIds,
                    actorUserId: signedUser.id,
                    projectId,
                    type: 'BOARD_TASK_CREATED',
                    message: `${projectNameForNotification}의 ${itemTitle} 업무에 담당자로 추가되었습니다.`,
                });
            }
        }

        const nextItemStatus = itemType === 'TASK' ? nextTaskStatus : null;
        if (itemType === 'TASK' && previousItemStatus && nextItemStatus && previousItemStatus !== nextItemStatus) {
            const recipientUserIds = Array.from(new Set([
                ...nextTaskAssigneeUserIds.map((userId) => userId.trim()).filter(Boolean),
                ...(itemAuthorId ? [itemAuthorId] : []),
            ]));

            await createNotificationsForUsers(writeSupabase, {
                recipientUserIds,
                actorUserId: signedUser.id,
                projectId,
                type: 'TASK_STATUS_CHANGED',
                message: `${projectNameForNotification}의 ${itemTitle} 업무의 진행 상태가 "${getTaskStatusLabel(nextItemStatus)}"로 변경되었습니다.`,
            });
        }

        return null;
    }

    if (action === 'board.deleteItem') {
        requireAuthUser(user);
        const projectId = normalizeText(payload.projectId);
        const itemId = normalizeText(payload.itemId);

        const { error } = await supabase
            .from('project_items')
            .delete()
            .eq('id', itemId)
            .eq('project_id', projectId);

        if (error) {
            throw new Error(error.message);
        }
        return null;
    }

    if (action === 'board.listCommentsByItems') {
        const projectId = normalizeText(payload.projectId);
        const itemIds = Array.isArray(payload.itemIds)
            ? Array.from(
                new Set(
                    payload.itemIds
                        .map((itemId) => normalizeText(itemId))
                        .filter(Boolean)
                )
            ).slice(0, 300)
            : [];

        if (!projectId || itemIds.length === 0) {
            return [];
        }

        const { data, error } = await supabase
            .from('project_item_comments')
            .select('id,project_id,item_id,parent_comment_id,author_user_id,author_name,body,created_at')
            .eq('project_id', projectId)
            .in('item_id', itemIds)
            .order('created_at', { ascending: true });

        if (error) {
            throw new Error(error.message);
        }

        return ((data ?? []) as unknown as Record<string, unknown>[]).map(toProjectItemComment);
    }

    if (action === 'board.createComment') {
        const signedUser = requireAuthUser(user);
        const projectId = normalizeText(payload.projectId);
        const itemId = normalizeText(payload.itemId);
        const body = normalizeText(payload.body);
        const parentCommentId = normalizeOptionalText(payload.parentCommentId);
        const author = (payload.author as Record<string, unknown>) ?? {};
        const authorName = normalizeText(author.name) || normalizeText(signedUser.email) || '사용자';

        if (!projectId || !itemId) {
            throw new Error('댓글 대상 정보가 올바르지 않습니다.');
        }
        if (!body) {
            throw new Error('댓글 내용을 입력해 주세요.');
        }

        const memberRole = await getProjectMemberRole(supabase, projectId, signedUser.id, signedUser.email ?? null);
        const isAdmin = await isSystemAdmin(supabase, signedUser);
        if (!memberRole && !isAdmin) {
            throw new Error('프로젝트 멤버만 댓글을 작성할 수 있습니다.');
        }

        const { data: itemRow, error: itemError } = await supabase
            .from('project_items')
            .select('id,item_type,title,author_id')
            .eq('id', itemId)
            .eq('project_id', projectId)
            .single();

        if (itemError || !itemRow) {
            throw new Error(itemError?.message ?? '댓글 대상 업무/글을 찾을 수 없습니다.');
        }

        const itemRecord = itemRow as Record<string, unknown>;
        const itemTitle = normalizeText(itemRecord.title) || '업무';
        const itemAuthorId = normalizeOptionalText(itemRecord.author_id);

        let normalizedParentCommentId: string | null = null;
        if (parentCommentId) {
            const { data: parentRow, error: parentError } = await supabase
                .from('project_item_comments')
                .select('id,project_id,item_id,parent_comment_id,author_user_id')
                .eq('id', parentCommentId)
                .single();

            if (parentError || !parentRow) {
                throw new Error(parentError?.message ?? '답글 대상 댓글을 찾을 수 없습니다.');
            }

            const parentRecord = parentRow as Record<string, unknown>;
            if (normalizeText(parentRecord.project_id) !== projectId || normalizeText(parentRecord.item_id) !== itemId) {
                throw new Error('해당 댓글에는 답글을 작성할 수 없습니다.');
            }
            if (normalizeOptionalText(parentRecord.parent_comment_id)) {
                throw new Error('답글은 1단계까지만 작성할 수 있습니다.');
            }

            normalizedParentCommentId = parentCommentId;
        }

        const { data: savedComment, error: saveCommentError } = await supabase
            .from('project_item_comments')
            .insert({
                project_id: projectId,
                item_id: itemId,
                parent_comment_id: normalizedParentCommentId,
                author_user_id: signedUser.id,
                author_name: authorName,
                body,
            })
            .select('id,project_id,item_id,parent_comment_id,author_user_id,author_name,body,created_at')
            .single();

        if (saveCommentError || !savedComment) {
            throw new Error(saveCommentError?.message ?? '댓글 저장에 실패했습니다.');
        }

        const notificationType = normalizedParentCommentId ? 'BOARD_REPLY_CREATED' : 'BOARD_COMMENT_CREATED';
        const notificationMessage = `${itemTitle}글에 ${authorName}님이 ${normalizedParentCommentId ? '답글' : '댓글'}을 남기셨습니다.`;
        const recipientUserIds: string[] = [
            ...(await listTaskAssigneeUserIds(supabase, projectId, itemId)),
        ];
        if (itemAuthorId) {
            recipientUserIds.push(itemAuthorId);
        }

        if (normalizedParentCommentId) {
            const { data: parentRow } = await supabase
                .from('project_item_comments')
                .select('author_user_id')
                .eq('id', normalizedParentCommentId)
                .maybeSingle();
            const parentAuthorUserId = normalizeOptionalText((parentRow as Record<string, unknown> | null)?.author_user_id);
            if (parentAuthorUserId) {
                recipientUserIds.push(parentAuthorUserId);
            }
        }

        await createNotificationsForUsers(supabase, {
            recipientUserIds,
            actorUserId: signedUser.id,
            projectId,
            type: notificationType,
            message: notificationMessage,
        });

        return toProjectItemComment(savedComment as unknown as Record<string, unknown>);
    }

    if (action === 'board.hasImageStoragePath') {
        requireAuthUser(user);
        const projectId = normalizeText(payload.projectId);
        const imageStoragePath = normalizeText(payload.imageStoragePath);
        const authorId = normalizeText(payload.authorId);
        if (!projectId || !imageStoragePath) {
            return false;
        }

        const query = supabase
            .from('project_items')
            .select('id')
            .eq('project_id', projectId)
            .eq('image_storage_path', imageStoragePath)
            .limit(1);

        if (authorId) {
            query.eq('author_id', authorId);
        }

        const { data, error } = await query.maybeSingle();
        if (error) {
            throw new Error(error.message);
        }
        return Boolean(data);
    }

    if (action === 'collab.getProjectMemberRole') {
        const projectId = normalizeText(payload.projectId);
        const userId = normalizeOptionalText(payload.userId);
        const email = normalizeOptionalText(payload.email);
        return getProjectMemberRole(supabase, projectId, userId, email);
    }

    if (action === 'collab.getProjectAccess') {
        const projectId = normalizeText(payload.projectId);
        const viewer = (payload.viewer as Record<string, unknown>) ?? {};
        const viewerUserId = normalizeOptionalText(viewer.userId);
        const viewerEmail = normalizeOptionalText(viewer.email);
        const role = await getProjectMemberRole(supabase, projectId, viewerUserId, viewerEmail);
        const admin = await isSystemAdmin(supabase, user);

        return {
            projectId,
            role,
            isMember: Boolean(role),
            isAdmin: admin,
        };
    }

    if (action === 'collab.listMyProjectMemberships') {
        const signedUser = requireAuthUser(user);
        const viewer = (payload.viewer as Record<string, unknown>) ?? {};
        const viewerUserId = normalizeText(viewer.userId) || signedUser.id;
        const viewerEmail = normalizeEmail(viewer.email || signedUser.email || '');

        const membershipFilters = [
            viewerUserId ? `user_id.eq.${viewerUserId}` : '',
            viewerEmail ? `email.eq.${viewerEmail}` : '',
        ].filter(Boolean);

        const projectIdSet = new Set<string>();

        if (membershipFilters.length > 0) {
            const { data: memberRows, error: memberRowsError } = await supabase
                .from('project_members')
                .select('project_id')
                .or(membershipFilters.join(','));

            if (memberRowsError) {
                throw new Error(memberRowsError.message);
            }

            for (const row of (memberRows ?? []) as unknown as Record<string, unknown>[]) {
                const projectId = normalizeText(row.project_id);
                if (projectId) {
                    projectIdSet.add(projectId);
                }
            }
        }

        if (viewerUserId) {
            const { data: createdRows, error: createdRowsError } = await supabase
                .from('projects')
                .select('id')
                .eq('created_by', viewerUserId);

            if (createdRowsError) {
                throw new Error(createdRowsError.message);
            }

            for (const row of (createdRows ?? []) as unknown as Record<string, unknown>[]) {
                const projectId = normalizeText(row.id);
                if (projectId) {
                    projectIdSet.add(projectId);
                }
            }
        }

        return Array.from(projectIdSet);
    }

    if (action === 'collab.listProjectMembersDetail') {
        requireAuthUser(user);
        const projectId = normalizeText(payload.projectId);
        const { data, error } = await supabase
            .from('project_members')
            .select('id,project_id,display_name,user_id,email,role,created_at')
            .eq('project_id', projectId)
            .order('created_at', { ascending: true });

        if (error) {
            throw new Error(error.message);
        }

        return ((data ?? []) as unknown as Record<string, unknown>[]).map(toProjectMember);
    }

    if (action === 'collab.listProjectInvitations') {
        requireAuthUser(user);
        const projectId = normalizeText(payload.projectId);
        const { data, error } = await supabase
            .from('project_invitations')
            .select('id,project_id,invitee_name,invitee_email,invitee_user_id,inviter_user_id,role,status,message,invited_by_name,created_at,responded_at')
            .eq('project_id', projectId)
            .order('created_at', { ascending: false });

        if (error) {
            throw new Error(error.message);
        }

        return ((data ?? []) as unknown as Record<string, unknown>[]).map(toProjectInvitation);
    }

    if (action === 'collab.listMyProjectInvitationsForUser') {
        const signedUser = requireAuthUser(user);
        const userId = signedUser.id;
        const email = normalizeEmail(signedUser.email);
        const filters = [userId ? `invitee_user_id.eq.${userId}` : '', email ? `invitee_email.eq.${email}` : '']
            .filter(Boolean)
            .join(',');

        if (!filters) {
            return [];
        }

        const { data, error } = await supabase
            .from('project_invitations')
            .select('id,project_id,invitee_name,invitee_email,invitee_user_id,inviter_user_id,role,status,message,invited_by_name,created_at,responded_at')
            .eq('status', 'PENDING')
            .or(filters)
            .order('created_at', { ascending: false });

        if (error) {
            throw new Error(error.message);
        }

        return ((data ?? []) as unknown as Record<string, unknown>[]).map(toProjectInvitation);
    }

    if (action === 'collab.createProjectInvitation') {
        const signedUser = requireAuthUser(user);
        const projectId = normalizeText(payload.projectId);
        const input = (payload.input as Record<string, unknown>) ?? {};
        const viewer = (payload.viewer as Record<string, unknown>) ?? {};

        const inviteeName = normalizeText(input.inviteeName);
        const inviteeEmail = normalizeEmail(input.inviteeEmail);
        const inviterName = normalizeText(input.inviterName) || normalizeText(viewer.displayName) || '관리자';
        if (!inviteeName || !inviteeEmail) {
            throw new Error('초대할 이름과 이메일을 입력해 주세요.');
        }

        const { data: inviteeProfile } = await supabase
            .from('user_profiles')
            .select('user_id,full_name')
            .eq('email', inviteeEmail)
            .maybeSingle();

        const inviteeUserId = normalizeOptionalText((inviteeProfile as Record<string, unknown> | null)?.user_id);
        const inviteeProfileName = normalizeOptionalText((inviteeProfile as Record<string, unknown> | null)?.full_name);

        const { data, error } = await supabase
            .from('project_invitations')
            .insert({
                project_id: projectId,
                invitee_name: inviteeProfileName || inviteeName,
                invitee_email: inviteeEmail,
                invitee_user_id: inviteeUserId,
                inviter_user_id: signedUser.id,
                role: 'member',
                status: 'PENDING',
                message: normalizeOptionalText(input.message),
                invited_by_name: inviterName,
            })
            .select('id,project_id,invitee_name,invitee_email,invitee_user_id,inviter_user_id,role,status,message,invited_by_name,created_at,responded_at')
            .single();

        if (error || !data) {
            throw new Error(error?.message ?? '초대 생성에 실패했습니다.');
        }

        if (inviteeUserId) {
            await createNotification(supabase, {
                recipientUserId: inviteeUserId,
                actorUserId: signedUser.id,
                projectId,
                relatedInvitationId: String((data as Record<string, unknown>).id ?? ''),
                type: 'PROJECT_INVITED',
                message: '프로젝트에 초대되었습니다.',
            });
        }

        return toProjectInvitation(data as unknown as Record<string, unknown>);
    }

    if (action === 'collab.createProjectJoinRequest') {
        const signedUser = requireAuthUser(user);
        const projectId = normalizeText(payload.projectId);
        const input = (payload.input as Record<string, unknown>) ?? {};

        const requesterName = normalizeText(input.requesterName) || normalizeText(signedUser.email) || signedUser.id;
        const requesterEmail = normalizeEmail(input.requesterEmail || signedUser.email || '');
        if (!requesterEmail) {
            throw new Error('신청자 이메일이 필요합니다.');
        }

        const { data, error } = await supabase
            .from('project_join_requests')
            .insert({
                project_id: projectId,
                requester_name: requesterName,
                requester_email: requesterEmail,
                requester_user_id: signedUser.id,
                message: normalizeOptionalText(input.message),
                status: 'PENDING',
            })
            .select('id,project_id,requester_name,requester_email,requester_user_id,message,status,reviewed_by_name,reviewed_by_user_id,created_at,reviewed_at')
            .single();

        if (error || !data) {
            throw new Error(error?.message ?? '참여 신청 생성에 실패했습니다.');
        }

        const { data: leaders } = await supabase
            .from('project_members')
            .select('user_id')
            .eq('project_id', projectId)
            .eq('role', 'leader');

        for (const leader of (leaders ?? []) as unknown as Record<string, unknown>[]) {
            const leaderUserId = normalizeOptionalText(leader.user_id);
            if (!leaderUserId) {
                continue;
            }
            await createNotification(supabase, {
                recipientUserId: leaderUserId,
                actorUserId: signedUser.id,
                projectId,
                relatedRequestId: String((data as Record<string, unknown>).id ?? ''),
                type: 'JOIN_REQUEST_CREATED',
                message: `${requesterName}님이 프로젝트 참여를 신청했습니다.`,
            });
        }

        return toProjectJoinRequest(data as unknown as Record<string, unknown>);
    }

    if (action === 'collab.listProjectJoinRequests') {
        requireAuthUser(user);
        const projectId = normalizeText(payload.projectId);
        const { data, error } = await supabase
            .from('project_join_requests')
            .select('id,project_id,requester_name,requester_email,requester_user_id,message,status,reviewed_by_name,reviewed_by_user_id,created_at,reviewed_at')
            .eq('project_id', projectId)
            .order('created_at', { ascending: false });

        if (error) {
            throw new Error(error.message);
        }

        return ((data ?? []) as unknown as Record<string, unknown>[]).map(toProjectJoinRequest);
    }

    if (action === 'collab.respondProjectInvitation') {
        const signedUser = requireAuthUser(user);
        const invitationId = normalizeText(payload.invitationId);
        const decision = normalizeText(payload.decision);
        const viewer = (payload.viewer as Record<string, unknown>) ?? {};
        const viewerName = normalizeText(viewer.displayName) || normalizeText(signedUser.email) || '사용자';

        const { data, error } = await supabase
            .from('project_invitations')
            .select('id,project_id,invitee_name,invitee_email,invitee_user_id,inviter_user_id,role,status,message,invited_by_name,created_at,responded_at')
            .eq('id', invitationId)
            .single();

        if (error || !data) {
            throw new Error(error?.message ?? '초대 정보를 찾을 수 없습니다.');
        }

        const invitation = data as unknown as Record<string, unknown>;
        if (String(invitation.status) !== 'PENDING') {
            throw new Error('이미 처리된 초대입니다.');
        }

        if (decision === 'ACCEPTED') {
            const { error: memberError } = await supabase
                .from('project_members')
                .insert({
                    project_id: String(invitation.project_id ?? ''),
                    display_name: normalizeText(invitation.invitee_name) || viewerName,
                    user_id: signedUser.id,
                    email: normalizeEmail(invitation.invitee_email),
                    role: 'member',
                });

            if (memberError && memberError.code !== '23505') {
                throw new Error(memberError.message);
            }

            try {
                await refreshProjectMembersCount(supabase, String(invitation.project_id ?? ''));
            } catch {
                // 멤버 카운트 동기화 실패는 초대 수락 자체를 막지 않습니다.
            }
        }

        const { error: updateError } = await supabase
            .from('project_invitations')
            .update({
                status: decision === 'ACCEPTED' ? 'ACCEPTED' : 'DECLINED',
                responded_at: new Date().toISOString(),
            })
            .eq('id', invitationId);

        if (updateError) {
            throw new Error(updateError.message);
        }

        await supabase
            .from('notifications')
            .delete()
            .eq('type', 'PROJECT_INVITED')
            .eq('related_invitation_id', invitationId)
            .eq('recipient_user_id', signedUser.id);

        const inviterUserId = normalizeOptionalText(invitation.inviter_user_id);
        if (inviterUserId) {
            await createNotification(supabase, {
                recipientUserId: inviterUserId,
                actorUserId: signedUser.id,
                projectId: normalizeOptionalText(invitation.project_id),
                relatedInvitationId: invitationId,
                type: decision === 'ACCEPTED' ? 'INVITATION_ACCEPTED' : 'INVITATION_DECLINED',
                message:
                    decision === 'ACCEPTED'
                        ? `${viewerName}님이 프로젝트 초대를 수락했습니다.`
                        : `${viewerName}님이 프로젝트 초대를 거절했습니다.`,
            });
        }

        const { data: saved, error: savedError } = await supabase
            .from('project_invitations')
            .select('id,project_id,invitee_name,invitee_email,invitee_user_id,inviter_user_id,role,status,message,invited_by_name,created_at,responded_at')
            .eq('id', invitationId)
            .single();

        if (savedError || !saved) {
            throw new Error(savedError?.message ?? '초대 상태를 확인하지 못했습니다.');
        }

        return toProjectInvitation(saved as unknown as Record<string, unknown>);
    }

    if (action === 'collab.reviewJoinRequest') {
        const signedUser = requireAuthUser(user);
        const requestId = normalizeText(payload.requestId);
        const decision = normalizeText(payload.decision);
        const reviewedBy = (payload.reviewedBy as Record<string, unknown>) ?? {};
        const reviewedByName = normalizeText(reviewedBy.displayName) || '관리자';

        const { data, error } = await supabase
            .from('project_join_requests')
            .select('id,project_id,requester_name,requester_email,requester_user_id,status')
            .eq('id', requestId)
            .single();

        if (error || !data) {
            throw new Error(error?.message ?? '참여 신청 정보를 찾지 못했습니다.');
        }

        const requestRow = data as unknown as Record<string, unknown>;
        if (String(requestRow.status) !== 'PENDING') {
            throw new Error('이미 처리된 신청입니다.');
        }

        if (decision === 'APPROVED') {
            const { error: memberError } = await supabase
                .from('project_members')
                .insert({
                    project_id: String(requestRow.project_id ?? ''),
                    display_name: normalizeText(requestRow.requester_name) || '사용자',
                    user_id: normalizeOptionalText(requestRow.requester_user_id),
                    email: normalizeEmail(requestRow.requester_email),
                    role: 'member',
                });

            if (memberError && memberError.code !== '23505') {
                throw new Error(memberError.message);
            }

            try {
                await refreshProjectMembersCount(supabase, String(requestRow.project_id ?? ''));
            } catch {
                // 멤버 카운트 동기화 실패는 승인 자체를 막지 않습니다.
            }
        }

        const { error: updateError } = await supabase
            .from('project_join_requests')
            .update({
                status: decision === 'APPROVED' ? 'APPROVED' : 'REJECTED',
                reviewed_by_name: reviewedByName,
                reviewed_by_user_id: signedUser.id,
                reviewed_at: new Date().toISOString(),
            })
            .eq('id', requestId);

        if (updateError) {
            throw new Error(updateError.message);
        }

        const requesterUserId = normalizeOptionalText(requestRow.requester_user_id);
        if (requesterUserId) {
            await createNotification(supabase, {
                recipientUserId: requesterUserId,
                actorUserId: signedUser.id,
                projectId: normalizeOptionalText(requestRow.project_id),
                relatedRequestId: requestId,
                type: decision === 'APPROVED' ? 'JOIN_REQUEST_APPROVED' : 'JOIN_REQUEST_REJECTED',
                message: decision === 'APPROVED' ? '프로젝트 참여 신청이 승인되었습니다.' : '프로젝트 참여 신청이 거절되었습니다.',
            });
        }

        return null;
    }

    if (action === 'collab.transferProjectLeader') {
        const signedUser = requireAuthUser(user);
        const projectId = normalizeText(payload.projectId);
        const nextLeaderMemberId = normalizeText(payload.nextLeaderMemberId);

        const { data: currentLeader, error: currentLeaderError } = await supabase
            .from('project_members')
            .select('id')
            .eq('project_id', projectId)
            .eq('role', 'leader')
            .limit(1)
            .single();

        if (currentLeaderError || !currentLeader) {
            throw new Error(currentLeaderError?.message ?? '현재 팀장을 찾을 수 없습니다.');
        }

        const { data: targetMember, error: targetMemberError } = await supabase
            .from('project_members')
            .select('id,user_id')
            .eq('id', nextLeaderMemberId)
            .eq('project_id', projectId)
            .single();

        if (targetMemberError || !targetMember) {
            throw new Error(targetMemberError?.message ?? '위임 대상 멤버를 찾을 수 없습니다.');
        }

        const { error: demoteError } = await supabase
            .from('project_members')
            .update({ role: 'member' })
            .eq('id', String((currentLeader as Record<string, unknown>).id ?? ''));

        if (demoteError) {
            throw new Error(demoteError.message);
        }

        const { error: promoteError } = await supabase
            .from('project_members')
            .update({ role: 'leader' })
            .eq('id', nextLeaderMemberId);

        if (promoteError) {
            throw new Error(promoteError.message);
        }

        const { data: projectRow } = await supabase
            .from('projects')
            .select('name')
            .eq('id', projectId)
            .maybeSingle();
        const projectName = normalizeText((projectRow as Record<string, unknown> | null)?.name) || '프로젝트';

        const targetUserId = normalizeOptionalText((targetMember as Record<string, unknown>).user_id);
        if (targetUserId) {
            await createNotification(supabase, {
                recipientUserId: targetUserId,
                actorUserId: signedUser.id,
                projectId,
                type: 'PROJECT_MEMBER_ROLE_CHANGED',
                message: `${projectName}프로젝트의 팀장이 되셨습니다.`,
            });
        }

        return null;
    }

    if (action === 'collab.leaveProject') {
        const signedUser = requireAuthUser(user);
        const projectId = normalizeText(payload.projectId);

        if (!projectId) {
            throw new Error('프로젝트 정보가 올바르지 않습니다.');
        }

        const { data: myMember, error: myMemberError } = await supabase
            .from('project_members')
            .select('id,role,display_name')
            .eq('project_id', projectId)
            .eq('user_id', signedUser.id)
            .maybeSingle();

        if (myMemberError) {
            throw new Error(myMemberError.message);
        }
        if (!myMember) {
            throw new Error('프로젝트 멤버만 프로젝트에서 나갈 수 있습니다.');
        }

        const myMemberRow = myMember as Record<string, unknown>;
        if (normalizeText(myMemberRow.role) === 'leader') {
            throw new Error('팀장은 프로젝트에서 나갈 수 없습니다. 다른 팀원에게 위임 해 주세요.');
        }

        const { data: projectRow } = await supabase
            .from('projects')
            .select('name')
            .eq('id', projectId)
            .maybeSingle();
        const projectName = normalizeText((projectRow as Record<string, unknown> | null)?.name) || '프로젝트';

        const { data: leaderRows, error: leaderRowsError } = await supabase
            .from('project_members')
            .select('user_id')
            .eq('project_id', projectId)
            .eq('role', 'leader');

        if (leaderRowsError) {
            throw new Error(leaderRowsError.message);
        }

        const { error: removeError } = await supabase
            .from('project_members')
            .delete()
            .eq('id', normalizeText(myMemberRow.id))
            .eq('project_id', projectId);

        if (removeError) {
            throw new Error(removeError.message);
        }

        await refreshProjectMembersCount(supabase, projectId);

        const leavingMemberName = normalizeText(myMemberRow.display_name) || '사용자';
        const leaderUserIds = Array.from(
            new Set(
                ((leaderRows ?? []) as unknown as Record<string, unknown>[])
                    .map((row) => normalizeOptionalText(row.user_id))
                    .filter((userId): userId is string => Boolean(userId))
                    .filter((userId) => userId !== signedUser.id)
            )
        );

        if (leaderUserIds.length > 0) {
            await createNotificationsForUsers(supabase, {
                recipientUserIds: leaderUserIds,
                actorUserId: signedUser.id,
                projectId,
                type: 'PROJECT_MEMBER_ROLE_CHANGED',
                message: `${leavingMemberName}님이 ${projectName}프로젝트에서 나갔습니다.`,
            });
        }

        return null;
    }

    if (action === 'collab.removeProjectMember') {
        requireAuthUser(user);
        const projectId = normalizeText(payload.projectId);
        const memberId = normalizeText(payload.memberId);

        if (!projectId || !memberId) {
            throw new Error('멤버 삭제 대상 정보가 올바르지 않습니다.');
        }

        const { data: targetMember, error: targetMemberError } = await supabase
            .from('project_members')
            .select('id,project_id,role')
            .eq('id', memberId)
            .eq('project_id', projectId)
            .single();

        if (targetMemberError || !targetMember) {
            throw new Error(targetMemberError?.message ?? '삭제할 멤버를 찾을 수 없습니다.');
        }

        if (normalizeText((targetMember as Record<string, unknown>).role) === 'leader') {
            throw new Error('팀장은 위임 후 삭제할 수 있습니다.');
        }

        const { error: removeError } = await supabase
            .from('project_members')
            .delete()
            .eq('id', memberId)
            .eq('project_id', projectId);

        if (removeError) {
            throw new Error(removeError.message);
        }

        await refreshProjectMembersCount(supabase, projectId);

        return null;
    }

    if (action === 'collab.listNotifications') {
        const signedUser = requireAuthUser(user);
        const userId = normalizeText(payload.userId);
        if (userId !== signedUser.id) {
            throw new Error('본인 알림만 조회할 수 있습니다.');
        }

        const { data, error } = await supabase
            .from('notifications')
            .select('id,recipient_user_id,actor_user_id,project_id,related_invitation_id,related_request_id,type,message,is_read,created_at')
            .eq('recipient_user_id', userId)
            .order('created_at', { ascending: false });

        if (error) {
            throw new Error(error.message);
        }

        return ((data ?? []) as unknown as Record<string, unknown>[]).map(toProjectNotification);
    }

    if (action === 'collab.markNotificationRead') {
        const signedUser = requireAuthUser(user);
        const notificationId = normalizeText(payload.notificationId);
        if (!notificationId) {
            return null;
        }

        const { error } = await supabase
            .from('notifications')
            .update({ is_read: true })
            .eq('id', notificationId)
            .eq('recipient_user_id', signedUser.id);

        if (error) {
            throw new Error(error.message);
        }

        return null;
    }

    if (action === 'collab.deleteNotification') {
        const signedUser = requireAuthUser(user);
        const notificationId = normalizeText(payload.notificationId);
        if (!notificationId) {
            return null;
        }

        const { data: targetRow, error: targetError } = await supabase
            .from('notifications')
            .select('id,recipient_user_id')
            .eq('id', notificationId)
            .maybeSingle();

        if (targetError) {
            throw new Error(targetError.message);
        }

        if (!targetRow) {
            return null;
        }

        const recipientUserId = normalizeText((targetRow as Record<string, unknown>).recipient_user_id);
        if (recipientUserId !== signedUser.id) {
            throw new Error('본인 알림만 삭제할 수 있습니다.');
        }

        const { error: updateError } = await supabase
            .from('notifications')
            .update({ is_read: true })
            .eq('id', notificationId)
            .eq('recipient_user_id', signedUser.id);

        if (updateError) {
            throw new Error(updateError.message);
        }

        const { error: deleteError } = await supabase
            .from('notifications')
            .delete()
            .eq('id', notificationId)
            .eq('recipient_user_id', signedUser.id);

        if (deleteError) {
            throw new Error(deleteError.message);
        }

        return null;
    }

    if (action === 'chat.listUsers') {
        requireAuthUser(user);
        const { data, error } = await supabase
            .from('user_profiles')
            .select('user_id,nickname,full_name,email,phone_number,avatar_url')
            .order('nickname', { ascending: true })
            .limit(300);

        if (error) {
            throw new Error(error.message);
        }

        return ((data ?? []) as unknown as Record<string, unknown>[]).map(toChatUser);
    }

    if (action === 'chat.listMyRooms') {
        const signedUser = requireAuthUser(user);
        const userId = signedUser.id;
        const { data, error } = await supabase
            .from('chat_room_members')
            .select('room_id,chat_rooms!inner(id,slug,title,room_type)')
            .eq('user_id', userId);

        if (error) {
            throw new Error(error.message);
        }

        const rooms = ((data ?? []) as unknown as Array<{ chat_rooms?: Record<string, unknown> | Record<string, unknown>[] | null }>)
            .map((row) => {
                const room = Array.isArray(row.chat_rooms) ? row.chat_rooms[0] : row.chat_rooms;
                return room ? toChatRoom(room) : null;
            })
            .filter((room): room is ReturnType<typeof toChatRoom> => Boolean(room));

        const uniqueById = new Map<string, ReturnType<typeof toChatRoom>>();
        rooms.forEach((room) => {
            uniqueById.set(room.id, room);
        });

        const allRooms = Array.from(uniqueById.values());

        // For direct rooms, compute per-viewer title (show the OTHER member's name)
        const directRoomIds = allRooms.filter((r) => r.roomType === 'direct').map((r) => r.id);
        if (directRoomIds.length > 0) {
            const { data: memberData } = await supabase
                .from('chat_room_members')
                .select('room_id,user_id')
                .in('room_id', directRoomIds);

            if (memberData) {
                // Map room_id -> other user's user_id
                const otherUserByRoom = new Map<string, string>();
                for (const row of memberData as Array<{ room_id: string; user_id: string }>) {
                    if (row.user_id !== userId) {
                        otherUserByRoom.set(row.room_id, row.user_id);
                    }
                }

                // Fetch display names for other users
                const otherUserIds = Array.from(new Set(otherUserByRoom.values()));
                if (otherUserIds.length > 0) {
                    const { data: profileData } = await supabase
                        .from('user_profiles')
                        .select('user_id,nickname')
                        .in('user_id', otherUserIds);

                    const nameByUserId = new Map<string, string>();
                    if (profileData) {
                        for (const profile of profileData as Array<{ user_id: string; nickname: string }>) {
                            nameByUserId.set(profile.user_id, profile.nickname);
                        }
                    }

                    // Override title for each direct room
                    for (const room of allRooms) {
                        if (room.roomType !== 'direct') continue;
                        const otherUserId = otherUserByRoom.get(room.id);
                        if (otherUserId) {
                            const otherName = nameByUserId.get(otherUserId) || '사용자';
                            (room as { title: string }).title = `${otherName}님과의 채팅`;
                        }
                    }
                }
            }
        }

        return allRooms;
    }

    if (action === 'chat.getUnreadCountSince') {
        const signedUser = requireAuthUser(user);
        const roomId = normalizeText(payload.roomId);
        const excludeUserId = signedUser.id;
        const sinceIsoDate = normalizeText(payload.sinceIsoDate);

        const query = supabase
            .from('chat_messages')
            .select('id', { count: 'exact', head: true })
            .eq('room_id', roomId)
            .neq('sender_user_id', excludeUserId);

        if (sinceIsoDate) {
            query.gt('created_at', sinceIsoDate);
        }

        const { count, error } = await query;
        if (error) {
            throw new Error(error.message);
        }
        return count ?? 0;
    }

    if (action === 'chat.listUnreadCountsByRooms') {
        const signedUser = requireAuthUser(user);
        const roomIds = Array.isArray(payload.roomIds) ? payload.roomIds.map((entry) => normalizeText(entry)).filter(Boolean) : [];
        const excludeUserId = signedUser.id;
        const sinceMap = (payload.sinceMap as Record<string, unknown>) ?? {};

        const result: Record<string, number> = {};
        for (const roomId of Array.from(new Set(roomIds))) {
            const sinceIsoDate = normalizeText(sinceMap[roomId]);
            const query = supabase
                .from('chat_messages')
                .select('id', { count: 'exact', head: true })
                .eq('room_id', roomId)
                .neq('sender_user_id', excludeUserId);

            if (sinceIsoDate) {
                query.gt('created_at', sinceIsoDate);
            }

            const { count, error } = await query;
            if (error) {
                throw new Error(error.message);
            }
            result[roomId] = count ?? 0;
        }

        return result;
    }

    if (action === 'chat.getOrCreateDirectRoom') {
        const signedUser = requireAuthUser(user);
        const currentUserId = normalizeText(payload.currentUserId);
        const targetUserId = normalizeText(payload.targetUserId);
        const targetDisplayName = normalizeText(payload.targetDisplayName) || '채팅';

        if (currentUserId !== signedUser.id) {
            throw new Error('채팅방 생성 권한이 없습니다.');
        }
        if (!targetUserId || currentUserId === targetUserId) {
            throw new Error('유효한 대상 사용자 정보가 필요합니다.');
        }

        const directKey = [currentUserId, targetUserId].sort().join(':');
        const existingRoom = (await findDirectRoomByKey(supabase, directKey))
            ?? (await findDirectRoomByKeyAsServiceRole(directKey));

        if (existingRoom) {
            const existingRoomId = normalizeText(existingRoom.id);
            if (!existingRoomId) {
                throw new Error('채팅방 정보를 확인하지 못했습니다.');
            }
            // 기존 방이 남아있고 멤버 row가 누락된 경우를 복구합니다.
            // service role을 사용하여 RLS 순환 의존성을 우회합니다.
            try {
                const serviceClient = createServiceRoleClient();
                await ensureDirectRoomMembers(serviceClient, existingRoomId, [currentUserId]);
            } catch {
                // service role 실패 시 일반 클라이언트로 시도합니다.
                await ensureDirectRoomMembers(supabase, existingRoomId, [currentUserId]);
            }
            return toChatRoom(existingRoom);
        }

        const chatSlug = `dm-${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`;
        const chatTitle = `${targetDisplayName}님과의 채팅`;

        // security definer RPC를 사용하여 방 생성 + 멤버 추가를 원자적으로 처리합니다.
        // 이는 chat_rooms / chat_room_members 간 RLS 순환 의존성을 우회합니다.
        const { data: rpcResult, error: rpcError } = await supabase.rpc(
            'create_direct_chat_room',
            {
                p_slug: chatSlug,
                p_title: chatTitle,
                p_created_by: currentUserId,
                p_direct_key: directKey,
                p_member_ids: [currentUserId, targetUserId],
            }
        );

        if (rpcError) {
            // direct_key 중복 충돌인 경우 기존 방을 찾아서 반환합니다.
            if (rpcError.code === '23505') {
                const conflictedRoom = (await findDirectRoomByKey(supabase, directKey))
                    ?? (await findDirectRoomByKeyAsServiceRole(directKey));
                if (conflictedRoom) {
                    const conflictedRoomId = normalizeText(conflictedRoom.id);
                    if (!conflictedRoomId) {
                        throw new Error('채팅방 정보를 확인하지 못했습니다.');
                    }
                    try {
                        const serviceClient = createServiceRoleClient();
                        await ensureDirectRoomMembers(serviceClient, conflictedRoomId, [currentUserId]);
                    } catch {
                        // 멤버 복구 실패는 무시합니다.
                    }
                    return toChatRoom(conflictedRoom);
                }
            }
            console.error('[chat.getOrCreateDirectRoom] RPC error:', JSON.stringify({
                message: rpcError.message,
                code: rpcError.code,
                details: rpcError.details,
                hint: rpcError.hint,
            }));
            throw new Error(rpcError.message ?? '채팅방 생성에 실패했습니다.');
        }

        if (!rpcResult) {
            throw new Error('채팅방 생성 결과를 확인하지 못했습니다.');
        }

        const roomData = (typeof rpcResult === 'string' ? JSON.parse(rpcResult) : rpcResult) as Record<string, unknown>;
        return toChatRoom(roomData);
    }

    if (action === 'chat.listRecentMessages') {
        requireAuthUser(user);
        const roomId = normalizeText(payload.roomId);
        const limitValue = typeof payload.limit === 'number' ? payload.limit : 30;
        const limit = Math.max(1, Math.min(30, Math.floor(limitValue)));

        const { data, error } = await supabase
            .from('chat_messages')
            .select(CHAT_MESSAGE_SELECT)
            .eq('room_id', roomId)
            .order('created_at', { ascending: false })
            .limit(limit);

        if (error) {
            throw new Error(error.message);
        }

        return ((data ?? []) as unknown as Record<string, unknown>[]).map(toChatMessage).reverse();
    }

    if (action === 'chat.sendMessage') {
        const signedUser = requireAuthUser(user);
        const roomId = normalizeText(payload.roomId);
        const senderUserId = normalizeText(payload.senderUserId);
        const senderName = normalizeText(payload.senderName) || '익명';
        const body = normalizeText(payload.body);
        const imageUrl = normalizeOptionalText(payload.imageUrl);

        if (senderUserId !== signedUser.id) {
            throw new Error('메시지 전송 권한이 없습니다.');
        }
        if (!body && !imageUrl) {
            throw new Error('메시지 또는 이미지를 입력해 주세요.');
        }

        const { data, error } = await supabase
            .from('chat_messages')
            .insert({
                room_id: roomId,
                sender_user_id: senderUserId,
                sender_name: senderName,
                body: body || null,
                image_url: imageUrl,
                image_original_filename: normalizeOptionalText(payload.imageOriginalFilename),
                image_stored_filename: normalizeOptionalText(payload.imageStoredFilename),
                image_storage_path: normalizeOptionalText(payload.imageStoragePath),
                image_size_bytes: normalizeOptionalNumber(payload.imageSizeBytes),
            })
            .select('id')
            .single();

        if (error || !data) {
            throw new Error(error?.message ?? '메시지 전송에 실패했습니다.');
        }

        return String((data as Record<string, unknown>).id ?? '');
    }

    if (action === 'chat.hasMessageByImageStoragePath') {
        requireAuthUser(user);
        const roomId = normalizeText(payload.roomId);
        const senderUserId = normalizeText(payload.senderUserId);
        const imageStoragePath = normalizeText(payload.imageStoragePath);

        if (!roomId || !senderUserId || !imageStoragePath) {
            return false;
        }

        const { data, error } = await supabase
            .from('chat_messages')
            .select('id')
            .eq('room_id', roomId)
            .eq('sender_user_id', senderUserId)
            .eq('image_storage_path', imageStoragePath)
            .limit(1)
            .maybeSingle();

        if (error) {
            throw new Error(error.message);
        }

        return Boolean(data);
    }

    throw new Error('지원하지 않는 요청입니다.');
}

function toStatusCode(errorMessage: string): number {
    if (/row-level security|permission denied|not authorized|rls|42501/i.test(errorMessage)) {
        return 403;
    }
    if (/로그인|인증/.test(errorMessage)) {
        return 401;
    }
    if (/권한|접근/.test(errorMessage)) {
        return 403;
    }
    if (/회원가입|프로필/.test(errorMessage)) {
        return 401;
    }
    if (/필수|형식|유효|누락|변경|존재하지/.test(errorMessage)) {
        return 400;
    }
    if (/지원하지 않는 요청/.test(errorMessage)) {
        return 404;
    }
    return 500;
}

function normalizeRateKeyToken(value: string): string {
    return value.replace(/[^a-zA-Z0-9:_-]/g, '').slice(0, 96);
}

function resolveRateLimitResource(payload: Record<string, unknown>): string {
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
        const value = normalizeText(payload[key]);
        if (value) {
            return normalizeRateKeyToken(value);
        }
    }

    return '';
}

export async function POST(request: Request) {
    try {
        const rawBody = (await request.json()) as { action?: unknown; payload?: unknown };
        const action = normalizeText(rawBody.action);
        const payload = sanitizeInput((rawBody.payload as Record<string, unknown>) ?? {});

        if (!action) {
            return NextResponse.json({ error: '요청 액션이 없습니다.' }, { status: 400 });
        }

        const { supabase, user } = await getAuthUserFromRequest(request);
        const userRateKeySegment = user?.id ? `u:${normalizeRateKeyToken(user.id)}` : 'u:anon';
        const resourceRateKeySegment = resolveRateLimitResource(payload);
        const actionRateKey = resourceRateKeySegment
            ? `bff:${action}:${userRateKeySegment}:r:${resourceRateKeySegment}`
            : `bff:${action}:${userRateKeySegment}`;

        const actionRateLimit = enforceRateLimit(request, actionRateKey);
        if (actionRateLimit) {
            return actionRateLimit;
        }

        const data = await runAction({
            action,
            payload,
            supabase,
            user,
        });

        return NextResponse.json({ data }, { status: 200 });
    } catch (error) {
        const message = error instanceof Error ? error.message : '요청 처리 중 오류가 발생했습니다.';
        return NextResponse.json(
            { error: message, code: 'BFF_ERROR' },
            { status: toStatusCode(message) }
        );
    }
}
