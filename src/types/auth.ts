export interface UserProfile {
    id: string;
    userId: string;
    email: string;
    fullName: string;
    nickname: string;
    phoneNumber: string;
    avatarUrl: string | null;
    avatarOriginalFilename?: string | null;
    avatarStoredFilename?: string | null;
    avatarStoragePath?: string | null;
    avatarSizeBytes?: number | null;
    createdAt: string;
    updatedAt: string;
}
