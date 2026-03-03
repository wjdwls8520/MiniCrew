export type ProjectVisibility = 'private' | 'public';
export type ProjectMemberRole = 'leader' | 'member';
export type ProjectStatus = 'REQUEST' | 'PROGRESS' | 'FEEDBACK' | 'REVIEW' | 'DONE' | 'HOLD' | 'ISSUE';
export type ProjectCreatorIdentity = {
    userId: string;
    email?: string;
    displayName: string;
};

export interface ProjectItem {
    id: string;
    name: string;
    description: string;
    members: number;
    status: ProjectStatus;
    startDate: string;
    endDate: string;
    isFavorite: boolean;
    category: string;
    themeColor: string;
    tags: string[];
    visibility: ProjectVisibility;
    createdBy: string | null;
    createdAt: string;
}

export interface CreateProjectInput {
    name: string;
    description: string;
    startDate: string;
    endDate: string;
    isFavorite: boolean;
    category: string;
    themeColor: string;
    tags: string[];
    status?: ProjectStatus;
    visibility: ProjectVisibility;
    initialMembers: {
        name: string;
        email?: string;
        userId: string;
    }[];
}
