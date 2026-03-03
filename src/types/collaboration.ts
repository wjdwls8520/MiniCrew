export type MemberRole = 'leader' | 'member';
export type InvitationStatus = 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'CANCELED' | 'EXPIRED';
export type JoinRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELED';

export interface ProjectMember {
    id: string;
    projectId: string;
    name: string;
    email: string | null;
    userId: string | null;
    role: MemberRole;
    createdAt: string;
}

export interface ProjectInvitation {
    id: string;
    projectId: string;
    projectName?: string;
    inviteeName: string;
    inviteeEmail: string;
    inviterId: string | null;
    inviteeId: string | null;
    role: MemberRole;
    status: InvitationStatus;
    message: string;
    invitedByName: string;
    createdAt: string;
    respondedAt: string | null;
}

export interface ProjectJoinRequest {
    id: string;
    projectId: string;
    requesterName: string;
    requesterEmail: string;
    message: string;
    status: JoinRequestStatus;
    reviewedByName: string | null;
    createdAt: string;
    reviewedAt: string | null;
}

export interface CreateProjectInvitationInput {
    inviteeName: string;
    inviteeEmail: string;
    inviterName: string;
    inviterId?: string;
    role?: MemberRole;
    message?: string;
}

export interface CreateProjectJoinRequestInput {
    requesterName: string;
    requesterEmail: string;
    requesterId?: string;
    message?: string;
}

export interface ProjectNotification {
    id: string;
    recipientId: string;
    actorId: string | null;
    projectId: string | null;
    relatedInvitationId: string | null;
    relatedRequestId: string | null;
    type:
        | 'PROJECT_INVITED'
        | 'INVITATION_ACCEPTED'
        | 'INVITATION_DECLINED'
        | 'JOIN_REQUEST_CREATED'
        | 'JOIN_REQUEST_APPROVED'
        | 'JOIN_REQUEST_REJECTED'
        | 'PROJECT_MEMBER_ROLE_CHANGED'
        | 'BOARD_TASK_CREATED'
        | 'BOARD_POST_CREATED'
        | 'BOARD_COMMENT_CREATED'
        | 'BOARD_REPLY_CREATED'
        | 'PROJECT_STATUS_CHANGED'
        | 'TASK_STATUS_CHANGED';
    message: string;
    isRead: boolean;
    createdAt: string;
}
