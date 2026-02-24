import { supabase } from '@/lib/supabase';
import type { UserProfile } from '@/types/auth';

interface UserProfileRow {
    id: string;
    user_id: string;
    email: string;
    full_name: string | null;
    nickname: string;
    created_at: string;
    updated_at: string;
}

const USER_PROFILE_SELECT = [
    'id',
    'user_id',
    'email',
    'full_name',
    'nickname',
    'created_at',
    'updated_at',
].join(',');

function normalizeText(value: string, fallback = ''): string {
    const trimmed = value.trim().toLowerCase();
    return trimmed || fallback;
}

function normalizeTextPreserveCase(value: string, fallback = ''): string {
    const trimmed = value.trim();
    return trimmed || fallback;
}

function normalizeNickname(nickname: string): string {
    const normalized = normalizeText(nickname);
    if (!normalized) {
        throw new Error('닉네임을 입력해 주세요.');
    }

    if (normalized.length > 30) {
        throw new Error('닉네임은 30자 이하로 입력해 주세요.');
    }

    return normalized;
}

function toUserProfile(row: UserProfileRow): UserProfile {
    return {
        id: row.id,
        userId: row.user_id,
        email: row.email,
        fullName: row.full_name ?? '',
        nickname: row.nickname,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

export async function getUserProfile(userId: string): Promise<UserProfile | null> {
    const trimmedUserId = normalizeText(userId);
    if (!trimmedUserId) {
        return null;
    }

    const { data, error } = await supabase
        .from('user_profiles')
        .select(USER_PROFILE_SELECT)
        .eq('user_id', trimmedUserId)
        .maybeSingle();

    if (error) {
        throw new Error(error.message);
    }

    if (!data) {
        return null;
    }

    return toUserProfile((data as unknown) as UserProfileRow);
}

export async function upsertUserProfile(params: {
    userId: string;
    email: string;
    fullName: string;
    nickname: string;
}): Promise<UserProfile> {
    const userId = normalizeText(params.userId);
    const email = normalizeText(params.email, `${userId}@local`);
    const fullName = normalizeTextPreserveCase(params.fullName, '');
    const nickname = normalizeNickname(params.nickname);

    if (!userId) {
        throw new Error('회원 정보를 확인할 수 없습니다.');
    }

    const payload = {
        user_id: userId,
        email,
        full_name: fullName || null,
        nickname,
    };

    const { data, error } = await supabase
        .from('user_profiles')
        .upsert(payload, {
            onConflict: 'user_id',
        })
        .select(USER_PROFILE_SELECT)
        .single();

    if (error || !data) {
        throw new Error(error?.message ?? '회원정보 저장에 실패했습니다.');
    }

    return toUserProfile((data as unknown) as UserProfileRow);
}

export function getDisplayNameFromUser(
    user: { user_metadata?: { full_name?: unknown; name?: unknown }; email?: string | null } | null,
    profile: UserProfile | null
): string {
    if (profile?.nickname && profile.nickname.trim()) {
        return profile.nickname.trim();
    }

    if (user) {
        const fullName =
            typeof user.user_metadata?.full_name === 'string'
                ? user.user_metadata.full_name
                : typeof user.user_metadata?.name === 'string'
                    ? user.user_metadata.name
                    : '';

        const trimmedFullName = fullName.trim();
        if (trimmedFullName) {
            return trimmedFullName;
        }

        const fallbackEmail = user.email ?? '';
        if (fallbackEmail.includes('@')) {
            return fallbackEmail.split('@')[0];
        }
    }

    return '익명';
}

export function getSignupNameFromUser(user: { email?: string | null; user_metadata?: { full_name?: unknown; name?: unknown } } | null): string {
    if (!user) {
        return '';
    }

    if (typeof user.user_metadata?.full_name === 'string') {
        const fullName = user.user_metadata.full_name.trim();
        if (fullName) {
            return fullName;
        }
    }

    if (typeof user.user_metadata?.name === 'string') {
        const displayName = user.user_metadata.name.trim();
        if (displayName) {
            return displayName;
        }
    }

    if (user.email) {
        return user.email.split('@')[0];
    }

    return '';
}
