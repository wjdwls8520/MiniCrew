export type TaskStatus = 'REQUEST' | 'PROGRESS' | 'FEEDBACK' | 'REVIEW' | 'DONE' | 'HOLD' | 'ISSUE';
export type TaskPriority = 'URGENT' | 'HIGH' | 'NORMAL' | 'LOW';

export interface TaskAttachment {
    id: string;
    fileUrl: string;
    originalFilename: string;
    storedFilename: string;
    storagePath: string;
    fileSizeBytes: number;
    mimeType: string;
    createdAt: string;
}

export interface TaskAttachmentInput {
    fileUrl: string;
    originalFilename: string;
    storedFilename: string;
    storagePath: string;
    fileSizeBytes: number;
    mimeType: string;
}

export interface TaskAssignee {
    id: string;
    name: string;
    userId?: string | null;
    avatar?: string;
}

export interface TaskAuthor {
    id: string;
    name: string;
    avatar?: string;
}

export interface Task {
    id: string;
    type: 'TASK';
    title: string;
    content: string;
    imageUrl?: string | null;
    imageOriginalFilename?: string | null;
    imageStoredFilename?: string | null;
    imageStoragePath?: string | null;
    imageSizeBytes?: number | null;
    attachments: TaskAttachment[];
    status: TaskStatus;
    priority: TaskPriority;
    progress: number;
    category?: string;
    startDate?: string;
    endDate?: string;
    assignees: TaskAssignee[];
    author: TaskAuthor;
    createdAt: string;
    commentCount: number;
}

export interface ProjectPost {
    id: string;
    type: 'POST';
    title: string;
    content: string;
    imageUrl?: string | null;
    imageOriginalFilename?: string | null;
    imageStoredFilename?: string | null;
    imageStoragePath?: string | null;
    imageSizeBytes?: number | null;
    category: string;
    attachments: TaskAttachment[];
    assignees: TaskAssignee[];
    authorId?: string | null;
    author: string;
    createdAt: string;
    commentCount: number;
}

export interface ProjectItemComment {
    id: string;
    projectId: string;
    itemId: string;
    parentCommentId: string | null;
    authorUserId: string | null;
    authorName: string;
    body: string;
    createdAt: string;
}

export interface ProjectMemberOption {
    id: string;
    name: string;
    userId?: string | null;
    email?: string | null;
    role?: 'leader' | 'member';
}

export interface CreateProjectItemInput {
    type: 'TASK' | 'POST';
    metaOnly?: boolean;
    title: string;
    content: string;
    status?: TaskStatus;
    progress?: number;
    priority?: TaskPriority;
    assignees?: string[];
    startDate?: string;
    endDate?: string;
    category?: string;
    imageFile?: File | null;
    removeImage?: boolean;
    imageUrl?: string | null;
    imageOriginalFilename?: string | null;
    imageStoredFilename?: string | null;
    imageStoragePath?: string | null;
    imageSizeBytes?: number | null;
    attachments?: TaskAttachmentInput[];
    attachmentFiles?: File[];
    retainedAttachments?: TaskAttachmentInput[];
    taskAttachmentFiles?: File[];
    taskRetainedAttachments?: TaskAttachmentInput[];
}
