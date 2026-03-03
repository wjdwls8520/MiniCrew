import { callBff } from '@/lib/api/client';
import type {
    CreateProjectInvitationInput,
    CreateProjectJoinRequestInput,
    InvitationStatus,
    JoinRequestStatus,
    MemberRole,
    ProjectMember,
    ProjectNotification,
    ProjectInvitation,
    ProjectJoinRequest,
} from '@/types/collaboration';

export interface ProjectAccess {
    projectId: string;
    role: MemberRole | null;
    isMember: boolean;
    isAdmin: boolean;
}

export async function listMyProjectMembershipProjectIds(viewer: {
    userId?: string | null;
    email?: string | null;
}): Promise<string[]> {
    return callBff<string[]>({
        action: 'collab.listMyProjectMemberships',
        payload: { viewer },
        requireAuth: true,
    });
}

function normalizeEmail(email?: string | null): string {
    return email ? email.trim().toLowerCase() : '';
}

function normalizeText(value?: string | null): string {
    return value?.trim() ?? '';
}

function getAdminUserIds(): Set<string> {
    const raw = process.env.NEXT_PUBLIC_MINICREW_ADMIN_USER_IDS ?? '';
    const items = raw
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);

    return new Set(items);
}

function getAdminEmails(): Set<string> {
    const raw = process.env.NEXT_PUBLIC_MINICREW_ADMIN_EMAILS ?? '';
    const items = raw
        .split(',')
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean);

    return new Set(items);
}

export function isSystemAdmin(userId?: string | null, email?: string | null): boolean {
    const normalizedUserId = normalizeText(userId);
    const normalizedEmail = normalizeEmail(email);

    if (normalizedUserId && getAdminUserIds().has(normalizedUserId)) {
        return true;
    }

    if (normalizedEmail && getAdminEmails().has(normalizedEmail)) {
        return true;
    }

    return false;
}

export async function getProjectMemberRole(
    projectId: string,
    userId: string | null,
    email?: string | null
): Promise<MemberRole | null> {
    return callBff<MemberRole | null>({
        action: 'collab.getProjectMemberRole',
        payload: { projectId, userId, email: email ?? null },
    });
}

export async function isProjectMember(
    projectId: string,
    userId: string | null,
    email?: string | null
): Promise<boolean> {
    const role = await getProjectMemberRole(projectId, userId, email);
    return Boolean(role);
}

export async function isProjectLeader(
    projectId: string,
    userId: string | null,
    email?: string | null
): Promise<boolean> {
    const role = await getProjectMemberRole(projectId, userId, email);
    return role === 'leader';
}

export async function getProjectAccess(
    projectId: string,
    viewer: { userId?: string | null; email?: string | null }
): Promise<ProjectAccess> {
    return callBff<ProjectAccess>({
        action: 'collab.getProjectAccess',
        payload: { projectId, viewer },
    });
}

export async function isProjectAdminOrLeader(
    projectId: string,
    viewer: { userId?: string | null; email?: string | null }
): Promise<boolean> {
    const access = await getProjectAccess(projectId, viewer);
    return access.isAdmin || access.role === 'leader';
}

export async function listProjectMembersDetail(projectId: string): Promise<ProjectMember[]> {
    return callBff<ProjectMember[]>({
        action: 'collab.listProjectMembersDetail',
        payload: { projectId },
        requireAuth: true,
    });
}

export async function listProjectInvitations(projectId: string): Promise<ProjectInvitation[]> {
    return callBff<ProjectInvitation[]>({
        action: 'collab.listProjectInvitations',
        payload: { projectId },
        requireAuth: true,
    });
}

export async function listMyProjectInvitationsForUser(params: {
    userId?: string | null;
    email?: string | null;
}): Promise<ProjectInvitation[]> {
    return callBff<ProjectInvitation[]>({
        action: 'collab.listMyProjectInvitationsForUser',
        payload: params,
        requireAuth: true,
    });
}

export async function createProjectInvitation(
    projectId: string,
    input: CreateProjectInvitationInput,
    viewer: { userId?: string | null; email?: string | null; displayName: string }
): Promise<ProjectInvitation> {
    return callBff<ProjectInvitation>({
        action: 'collab.createProjectInvitation',
        payload: { projectId, input, viewer },
        requireAuth: true,
    });
}

export async function createProjectJoinRequest(
    projectId: string,
    input: CreateProjectJoinRequestInput,
    viewer: { userId?: string | null; email?: string | null; displayName: string }
): Promise<ProjectJoinRequest> {
    return callBff<ProjectJoinRequest>({
        action: 'collab.createProjectJoinRequest',
        payload: { projectId, input, viewer },
        requireAuth: true,
    });
}

export async function listProjectJoinRequests(projectId: string): Promise<ProjectJoinRequest[]> {
    return callBff<ProjectJoinRequest[]>({
        action: 'collab.listProjectJoinRequests',
        payload: { projectId },
        requireAuth: true,
    });
}

export async function respondProjectInvitation(
    invitationId: string,
    decision: Exclude<InvitationStatus, 'PENDING'>,
    viewer: { userId?: string | null; email?: string | null; displayName: string }
): Promise<ProjectInvitation> {
    return callBff<ProjectInvitation>({
        action: 'collab.respondProjectInvitation',
        payload: { invitationId, decision, viewer },
        requireAuth: true,
    });
}

export async function reviewJoinRequest(
    requestId: string,
    decision: 'APPROVED' | 'REJECTED',
    reviewedBy: { userId?: string | null; displayName: string; email?: string | null }
): Promise<void> {
    await callBff<null>({
        action: 'collab.reviewJoinRequest',
        payload: { requestId, decision, reviewedBy },
        requireAuth: true,
    });
}

export async function transferProjectLeader(
    projectId: string,
    nextLeaderMemberId: string,
    changedBy: { userId?: string | null; displayName: string }
): Promise<void> {
    await callBff<null>({
        action: 'collab.transferProjectLeader',
        payload: { projectId, nextLeaderMemberId, changedBy },
        requireAuth: true,
    });
}

export async function removeProjectMember(
    projectId: string,
    memberId: string,
    actor: { userId?: string | null; displayName: string }
): Promise<void> {
    await callBff<null>({
        action: 'collab.removeProjectMember',
        payload: { projectId, memberId, actor },
        requireAuth: true,
    });
}

export async function leaveProject(projectId: string): Promise<void> {
    await callBff<null>({
        action: 'collab.leaveProject',
        payload: { projectId },
        requireAuth: true,
    });
}

export async function listNotifications(userId: string): Promise<ProjectNotification[]> {
    return callBff<ProjectNotification[]>({
        action: 'collab.listNotifications',
        payload: { userId },
        requireAuth: true,
    });
}

export async function markNotificationRead(notificationId: string): Promise<void> {
    await callBff<null>({
        action: 'collab.markNotificationRead',
        payload: { notificationId },
        requireAuth: true,
    });
}

export async function deleteNotification(notificationId: string): Promise<void> {
    await callBff<null>({
        action: 'collab.deleteNotification',
        payload: { notificationId },
        requireAuth: true,
    });
}

export type { JoinRequestStatus };
