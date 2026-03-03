export interface ChatRoomItem {
    id: string;
    slug: string;
    title: string;
    roomType: 'public' | 'direct';
}

export interface ChatUserItem {
    userId: string;
    displayName: string;
    fullName?: string;
    nickname?: string;
    email: string;
    phoneNumber: string;
    avatarUrl?: string | null;
}

export interface ChatMessageItem {
    id: string;
    roomId: string;
    senderUserId: string;
    senderName: string;
    body: string;
    imageUrl?: string | null;
    imageOriginalFilename?: string | null;
    imageStoredFilename?: string | null;
    imageStoragePath?: string | null;
    imageSizeBytes?: number | null;
    createdAt: string;
}
