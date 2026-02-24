export type MemberRole = 'leader' | 'member';
export type InvitationStatus = 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'CANCELED' | 'EXPIRED';
export type JoinRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELED';

export interface ProjectMember {
    id: string;
    projectId: string;
    name: string;
    email: string | null;
    role: MemberRole;
    createdAt: string;
}

export interface ProjectInvitation {
    id: string;
    projectId: string;
    inviteeName: string;
    inviteeEmail: string;
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
    role?: MemberRole;
    message?: string;
    invitedByName?: string;
}

export interface CreateProjectJoinRequestInput {
    requesterName: string;
    requesterEmail: string;
    message?: string;
}
