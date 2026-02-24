export type TaskStatus = 'REQUEST' | 'PROGRESS' | 'FEEDBACK' | 'REVIEW' | 'DONE' | 'HOLD' | 'ISSUE';
export type TaskPriority = 'URGENT' | 'HIGH' | 'NORMAL' | 'LOW';

export interface TaskAssignee {
    id: string;
    name: string;
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
    category: string;
    author: string;
    createdAt: string;
    commentCount: number;
}

export interface ProjectMemberOption {
    id: string;
    name: string;
}

export interface CreateProjectItemInput {
    type: 'TASK' | 'POST';
    title: string;
    content: string;
    status?: TaskStatus;
    priority?: TaskPriority;
    assignees?: string[];
    startDate?: string;
    endDate?: string;
    category?: string;
}
