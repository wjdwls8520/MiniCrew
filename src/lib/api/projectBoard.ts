import { callBff } from '@/lib/api/client';
import type { CreateProjectItemInput, ProjectItemComment, ProjectMemberOption, ProjectPost, Task } from '@/types/workflow';

export async function listProjectMembers(projectId: string): Promise<ProjectMemberOption[]> {
    return callBff<ProjectMemberOption[]>({
        action: 'board.listMembers',
        payload: { projectId },
    });
}

export async function listProjectBoardItems(projectId: string): Promise<{ tasks: Task[]; posts: ProjectPost[] }> {
    return callBff<{ tasks: Task[]; posts: ProjectPost[] }>({
        action: 'board.listItems',
        payload: { projectId },
    });
}

export async function updateProjectBoardItem(
    projectId: string,
    itemId: string,
    input: CreateProjectItemInput,
    actor: {
        id: string;
        email?: string | null;
        name: string;
    }
): Promise<void> {
    await callBff<null>({
        action: 'board.updateItem',
        payload: { projectId, itemId, input, actor },
        requireAuth: true,
    });
}

export async function createProjectBoardItem(
    projectId: string,
    input: CreateProjectItemInput,
    author: {
        id: string;
        name: string;
        email?: string | null;
    }
): Promise<string> {
    return callBff<string>({
        action: 'board.createItem',
        payload: { projectId, input, author },
        requireAuth: true,
    });
}

export async function deleteProjectBoardItem(
    itemId: string,
    projectId: string,
    actor: {
        id: string;
        email?: string | null;
        name: string;
    }
): Promise<void> {
    await callBff<null>({
        action: 'board.deleteItem',
        payload: { itemId, projectId, actor },
        requireAuth: true,
    });
}

export async function hasProjectItemByImageStoragePath(input: {
    projectId: string;
    imageStoragePath: string;
    authorId?: string | null;
}): Promise<boolean> {
    return callBff<boolean>({
        action: 'board.hasImageStoragePath',
        payload: input,
        requireAuth: true,
    });
}

export async function listProjectItemComments(projectId: string, itemIds: string[]): Promise<ProjectItemComment[]> {
    return callBff<ProjectItemComment[]>({
        action: 'board.listCommentsByItems',
        payload: { projectId, itemIds },
    });
}

export async function createProjectItemComment(input: {
    projectId: string;
    itemId: string;
    body: string;
    parentCommentId?: string | null;
    author: {
        id: string;
        name: string;
    };
}): Promise<ProjectItemComment> {
    return callBff<ProjectItemComment>({
        action: 'board.createComment',
        payload: input,
        requireAuth: true,
    });
}
