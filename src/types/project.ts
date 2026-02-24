export type ProjectVisibility = 'private' | 'public';
export type ProjectMemberRole = 'leader' | 'member';

export interface ProjectItem {
    id: string;
    name: string;
    description: string;
    members: number;
    startDate: string;
    endDate: string;
    isFavorite: boolean;
    category: string;
    themeColor: string;
    tags: string[];
    visibility: ProjectVisibility;
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
    visibility: ProjectVisibility;
    initialMembers: {
        name: string;
        email?: string;
        role?: ProjectMemberRole;
    }[];
}
