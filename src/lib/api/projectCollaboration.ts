import { supabase } from '@/lib/supabase';
import { addProjectMembers } from '@/lib/api/projects';
import type {
    CreateProjectInvitationInput,
    CreateProjectJoinRequestInput,
    InvitationStatus,
    JoinRequestStatus,
    MemberRole,
    ProjectInvitation,
    ProjectJoinRequest,
    ProjectMember,
} from '@/types/collaboration';

interface ProjectMemberRow {
    id: string;
    project_id: string;
    display_name: string;
    email: string | null;
    role: MemberRole;
    created_at: string;
}

interface ProjectInvitationRow {
    id: string;
    project_id: string;
    invitee_name: string;
    invitee_email: string;
    role: MemberRole;
    status: InvitationStatus;
    message: string | null;
    invited_by_name: string;
    created_at: string;
    responded_at: string | null;
}

interface ProjectJoinRequestRow {
    id: string;
    project_id: string;
    requester_name: string;
    requester_email: string;
    message: string | null;
    status: JoinRequestStatus;
    reviewed_by_name: string | null;
    created_at: string;
    reviewed_at: string | null;
}

function normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
}

function toProjectMember(row: ProjectMemberRow): ProjectMember {
    return {
        id: row.id,
        projectId: row.project_id,
        name: row.display_name,
        email: row.email,
        role: row.role,
        createdAt: row.created_at,
    };
}

function toProjectInvitation(row: ProjectInvitationRow): ProjectInvitation {
    return {
        id: row.id,
        projectId: row.project_id,
        inviteeName: row.invitee_name,
        inviteeEmail: row.invitee_email,
        role: row.role,
        status: row.status,
        message: row.message ?? '',
        invitedByName: row.invited_by_name,
        createdAt: row.created_at,
        respondedAt: row.responded_at,
    };
}

function toProjectJoinRequest(row: ProjectJoinRequestRow): ProjectJoinRequest {
    return {
        id: row.id,
        projectId: row.project_id,
        requesterName: row.requester_name,
        requesterEmail: row.requester_email,
        message: row.message ?? '',
        status: row.status,
        reviewedByName: row.reviewed_by_name,
        createdAt: row.created_at,
        reviewedAt: row.reviewed_at,
    };
}

export async function listProjectMembersDetail(projectId: string): Promise<ProjectMember[]> {
    const { data, error } = await supabase
        .from('project_members')
        .select('id,project_id,display_name,email,role,created_at')
        .eq('project_id', projectId)
        .order('created_at', { ascending: true });

    if (error) {
        throw new Error(error.message);
    }

    const rows = ((data ?? []) as unknown) as ProjectMemberRow[];
    return rows.map(toProjectMember);
}

export async function createProjectInvitation(projectId: string, input: CreateProjectInvitationInput): Promise<ProjectInvitation> {
    const inviteeName = input.inviteeName.trim();
    const inviteeEmail = normalizeEmail(input.inviteeEmail);

    if (!inviteeName || !inviteeEmail) {
        throw new Error('초대할 이름과 이메일을 입력해 주세요.');
    }

    const { data, error } = await supabase
        .from('project_invitations')
        .insert({
            project_id: projectId,
            invitee_name: inviteeName,
            invitee_email: inviteeEmail,
            role: input.role === 'leader' ? 'leader' : 'member',
            status: 'PENDING',
            message: input.message?.trim() || null,
            invited_by_name: input.invitedByName?.trim() || '관리자',
        })
        .select('id,project_id,invitee_name,invitee_email,role,status,message,invited_by_name,created_at,responded_at')
        .single();

    if (error || !data) {
        throw new Error(error?.message ?? '초대 생성에 실패했습니다.');
    }

    return toProjectInvitation((data as unknown) as ProjectInvitationRow);
}

export async function listProjectInvitations(projectId: string): Promise<ProjectInvitation[]> {
    const { data, error } = await supabase
        .from('project_invitations')
        .select('id,project_id,invitee_name,invitee_email,role,status,message,invited_by_name,created_at,responded_at')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });

    if (error) {
        throw new Error(error.message);
    }

    const rows = ((data ?? []) as unknown) as ProjectInvitationRow[];
    return rows.map(toProjectInvitation);
}

export async function createProjectJoinRequest(projectId: string, input: CreateProjectJoinRequestInput): Promise<ProjectJoinRequest> {
    const requesterName = input.requesterName.trim();
    const requesterEmail = normalizeEmail(input.requesterEmail);

    if (!requesterName || !requesterEmail) {
        throw new Error('신청자 이름과 이메일을 입력해 주세요.');
    }

    const { data, error } = await supabase
        .from('project_join_requests')
        .insert({
            project_id: projectId,
            requester_name: requesterName,
            requester_email: requesterEmail,
            message: input.message?.trim() || null,
            status: 'PENDING',
        })
        .select('id,project_id,requester_name,requester_email,message,status,reviewed_by_name,created_at,reviewed_at')
        .single();

    if (error || !data) {
        throw new Error(error?.message ?? '가입 신청 생성에 실패했습니다.');
    }

    return toProjectJoinRequest((data as unknown) as ProjectJoinRequestRow);
}

export async function listProjectJoinRequests(projectId: string): Promise<ProjectJoinRequest[]> {
    const { data, error } = await supabase
        .from('project_join_requests')
        .select('id,project_id,requester_name,requester_email,message,status,reviewed_by_name,created_at,reviewed_at')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });

    if (error) {
        throw new Error(error.message);
    }

    const rows = ((data ?? []) as unknown) as ProjectJoinRequestRow[];
    return rows.map(toProjectJoinRequest);
}

export async function reviewJoinRequest(requestId: string, decision: 'APPROVED' | 'REJECTED', reviewedByName = '관리자'): Promise<void> {
    const { data, error } = await supabase
        .from('project_join_requests')
        .select('id,project_id,requester_name,requester_email,status')
        .eq('id', requestId)
        .single();

    if (error || !data) {
        throw new Error(error?.message ?? '가입 신청 정보를 찾지 못했습니다.');
    }

    const requestRow = (data as {
        id: string;
        project_id: string;
        requester_name: string;
        requester_email: string;
        status: JoinRequestStatus;
    });

    if (requestRow.status !== 'PENDING') {
        throw new Error('이미 처리된 신청입니다.');
    }

    if (decision === 'APPROVED') {
        await addProjectMembers(requestRow.project_id, [
            {
                name: requestRow.requester_name,
                email: requestRow.requester_email,
                role: 'member',
            },
        ]);
    }

    const { error: updateError } = await supabase
        .from('project_join_requests')
        .update({
            status: decision,
            reviewed_by_name: reviewedByName,
            reviewed_at: new Date().toISOString(),
        })
        .eq('id', requestId);

    if (updateError) {
        throw new Error(updateError.message);
    }
}

export async function updateInvitationStatus(invitationId: string, status: Exclude<InvitationStatus, 'PENDING'>): Promise<void> {
    const { error } = await supabase
        .from('project_invitations')
        .update({
            status,
            responded_at: new Date().toISOString(),
        })
        .eq('id', invitationId)
        .eq('status', 'PENDING');

    if (error) {
        throw new Error(error.message);
    }
}
