import { callBff } from '@/lib/api/client';
import type { UserProfile } from '@/types/auth';

export async function getUserProfile(userId: string): Promise<UserProfile | null> {
    const normalizedUserId = userId.trim();
    if (!normalizedUserId) {
        return null;
    }

    return callBff<UserProfile | null>({
        action: 'auth.getUserProfile',
        payload: { userId: normalizedUserId },
        requireAuth: true,
    });
}

export async function upsertUserProfile(params: {
    userId: string;
    email: string;
    fullName: string;
    nickname: string;
    phoneNumber: string;
    avatarUrl?: string | null;
    avatarOriginalFilename?: string | null;
    avatarStoredFilename?: string | null;
    avatarStoragePath?: string | null;
    avatarSizeBytes?: number | null;
}): Promise<UserProfile> {
    return callBff<UserProfile>({
        action: 'auth.upsertUserProfile',
        payload: params,
        requireAuth: true,
    });
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
