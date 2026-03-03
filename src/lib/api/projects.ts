import { callBff } from '@/lib/api/client';
import type { CreateProjectInput, ProjectCreatorIdentity, ProjectItem, ProjectMemberRole, ProjectStatus } from '@/types/project';

export interface ProjectMemberSeedInput {
    name: string;
    email?: string;
    userId?: string;
    role?: ProjectMemberRole;
}

interface ProjectMembershipFilter {
    userId?: string | null;
    email?: string | null;
}

interface ProjectEditorIdentity {
    userId: string | null;
    email?: string | null;
}

export async function listProjects(membership?: ProjectMembershipFilter): Promise<ProjectItem[]> {
    return callBff<ProjectItem[]>({
        action: 'projects.list',
        payload: { membership: membership ?? null },
    });
}

export async function getProjectById(projectId: string): Promise<ProjectItem | null> {
    const normalizedProjectId = projectId.trim();
    if (!normalizedProjectId) {
        return null;
    }

    return callBff<ProjectItem | null>({
        action: 'projects.getById',
        payload: { projectId: normalizedProjectId },
    });
}

export async function getProjectByIdForViewer(
    projectId: string,
    membership?: ProjectMembershipFilter
): Promise<ProjectItem | null> {
    const normalizedProjectId = projectId.trim();
    if (!normalizedProjectId) {
        return null;
    }

    return callBff<ProjectItem | null>({
        action: 'projects.getByIdForViewer',
        payload: {
            projectId: normalizedProjectId,
            membership: membership ?? null,
        },
    });
}

export async function addProjectMembers(projectId: string, members: ProjectMemberSeedInput[]): Promise<void> {
    await callBff<null>({
        action: 'projects.addMembers',
        payload: { projectId, members },
        requireAuth: true,
    });
}

export async function createProject(input: CreateProjectInput, creator: ProjectCreatorIdentity): Promise<ProjectItem> {
    return callBff<ProjectItem>({
        action: 'projects.create',
        payload: { input, creator },
        requireAuth: true,
    });
}

export async function updateProject(
    projectId: string,
    updates: Partial<{
        name: string;
        description: string;
        category: string;
        themeColor: string;
        status: ProjectStatus;
        startDate: string;
        endDate: string;
        visibility: 'private' | 'public';
        tags: string[];
    }>,
    actor: ProjectEditorIdentity
): Promise<ProjectItem> {
    return callBff<ProjectItem>({
        action: 'projects.update',
        payload: { projectId, updates, actor },
        requireAuth: true,
    });
}

export async function deleteProject(projectId: string, actor: ProjectEditorIdentity): Promise<void> {
    await callBff<null>({
        action: 'projects.delete',
        payload: { projectId, actor },
        requireAuth: true,
    });
}

export async function updateProjectFavorite(projectId: string, isFavorite: boolean): Promise<ProjectItem> {
    return callBff<ProjectItem>({
        action: 'projects.updateFavorite',
        payload: { projectId, isFavorite },
        requireAuth: true,
    });
}
