import { supabase } from '@/lib/supabase';
import type { CreateProjectItemInput, ProjectMemberOption, ProjectPost, Task, TaskPriority, TaskStatus } from '@/types/workflow';

interface ProjectMemberRow {
    id: string;
    display_name: string | null;
}

interface AssigneeJoinRow {
    member_id: string;
    project_members: {
        id: string;
        display_name: string | null;
    } | null;
}

interface ProjectItemRow {
    id: string;
    item_type: 'TASK' | 'POST' | string;
    title: string;
    content: string;
    status: string | null;
    priority: string | null;
    progress: number | null;
    category: string | null;
    start_date: string | null;
    end_date: string | null;
    author_name: string | null;
    created_at: string;
    comment_count: number | null;
    project_item_assignees?: AssigneeJoinRow[] | null;
}

const TASK_STATUSES: TaskStatus[] = ['REQUEST', 'PROGRESS', 'FEEDBACK', 'REVIEW', 'DONE', 'HOLD', 'ISSUE'];
const TASK_PRIORITIES: TaskPriority[] = ['URGENT', 'HIGH', 'NORMAL', 'LOW'];

function isTaskStatus(value: string | null): value is TaskStatus {
    return !!value && TASK_STATUSES.includes(value as TaskStatus);
}

function isTaskPriority(value: string | null): value is TaskPriority {
    return !!value && TASK_PRIORITIES.includes(value as TaskPriority);
}

function mapTaskAssignees(row: ProjectItemRow): Task['assignees'] {
    if (!Array.isArray(row.project_item_assignees)) {
        return [];
    }

    return row.project_item_assignees
        .map((assigneeRow) => assigneeRow.project_members)
        .filter((member): member is { id: string; display_name: string | null } => Boolean(member?.id))
        .map((member) => ({
            id: member.id,
            name: (member.display_name ?? '').trim() || '이름없음',
        }));
}

function mapTask(row: ProjectItemRow): Task {
    return {
        id: row.id,
        type: 'TASK',
        title: row.title,
        content: row.content,
        status: isTaskStatus(row.status) ? row.status : 'REQUEST',
        priority: isTaskPriority(row.priority) ? row.priority : 'NORMAL',
        progress: Number.isFinite(row.progress) ? Math.max(0, Math.min(100, Number(row.progress))) : 0,
        category: row.category ?? 'PLANNING',
        startDate: row.start_date ?? '',
        endDate: row.end_date ?? '',
        assignees: mapTaskAssignees(row),
        author: {
            id: 'anonymous',
            name: (row.author_name ?? '').trim() || '익명',
        },
        createdAt: row.created_at.split('T')[0],
        commentCount: row.comment_count ?? 0,
    };
}

function mapPost(row: ProjectItemRow): ProjectPost {
    return {
        id: row.id,
        type: 'POST',
        title: row.title,
        content: row.content,
        category: row.category ?? 'ALL',
        author: (row.author_name ?? '').trim() || '익명',
        createdAt: row.created_at.split('T')[0],
        commentCount: row.comment_count ?? 0,
    };
}

function normalizeDate(value?: string): string | null {
    if (!value) {
        return null;
    }

    const trimmed = value.trim();
    return trimmed ? trimmed : null;
}

function validateDateRange(startDate: string | null, endDate: string | null): void {
    if (startDate && endDate && startDate > endDate) {
        throw new Error('종료일은 시작일보다 빠를 수 없습니다.');
    }
}

export async function listProjectMembers(projectId: string): Promise<ProjectMemberOption[]> {
    const { data, error } = await supabase
        .from('project_members')
        .select('id,display_name')
        .eq('project_id', projectId)
        .order('created_at', { ascending: true });

    if (error) {
        throw new Error(error.message);
    }

    const rows = ((data ?? []) as unknown) as ProjectMemberRow[];

    return rows.map((row) => ({
        id: row.id,
        name: (row.display_name ?? '').trim() || '이름없음',
    }));
}

export async function listProjectBoardItems(projectId: string): Promise<{ tasks: Task[]; posts: ProjectPost[] }> {
    const { data, error } = await supabase
        .from('project_items')
        .select(
            [
                'id',
                'item_type',
                'title',
                'content',
                'status',
                'priority',
                'progress',
                'category',
                'start_date',
                'end_date',
                'author_name',
                'created_at',
                'comment_count',
                'project_item_assignees ( member_id, project_members ( id, display_name ) )',
            ].join(',')
        )
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });

    if (error) {
        throw new Error(error.message);
    }

    const rows = ((data ?? []) as unknown) as ProjectItemRow[];
    const tasks: Task[] = [];
    const posts: ProjectPost[] = [];

    rows.forEach((row) => {
        if (row.item_type === 'TASK') {
            tasks.push(mapTask(row));
            return;
        }

        if (row.item_type === 'POST') {
            posts.push(mapPost(row));
        }
    });

    return { tasks, posts };
}

export async function createProjectBoardItem(
    projectId: string,
    input: CreateProjectItemInput,
    authorName: string
): Promise<void> {
    const title = input.title.trim();
    const content = input.content.trim();

    if (!title || !content) {
        throw new Error('제목과 내용을 모두 입력해 주세요.');
    }

    const startDate = normalizeDate(input.startDate);
    const endDate = normalizeDate(input.endDate);

    validateDateRange(startDate, endDate);

    const itemType = input.type;

    const { data, error } = await supabase
        .from('project_items')
        .insert({
            project_id: projectId,
            item_type: itemType,
            title,
            content,
            status: itemType === 'TASK' ? (isTaskStatus(input.status ?? null) ? input.status : 'REQUEST') : null,
            priority: itemType === 'TASK' ? (isTaskPriority(input.priority ?? null) ? input.priority : 'NORMAL') : null,
            progress: itemType === 'TASK' ? 0 : null,
            category: (input.category ?? '').trim() || 'PLANNING',
            start_date: itemType === 'TASK' ? startDate : null,
            end_date: itemType === 'TASK' ? endDate : null,
            author_name: authorName.trim() || '익명',
            comment_count: 0,
        })
        .select('id')
        .single();

    if (error || !data) {
        throw new Error(error?.message ?? '작성 데이터 저장에 실패했습니다.');
    }

    if (itemType !== 'TASK') {
        return;
    }

    const assigneeIds = Array.from(new Set((input.assignees ?? []).filter(Boolean)));

    if (assigneeIds.length === 0) {
        return;
    }

    const { error: assigneeError } = await supabase
        .from('project_item_assignees')
        .insert(
            assigneeIds.map((memberId) => ({
                project_id: projectId,
                item_id: data.id,
                member_id: memberId,
            }))
        );

    if (assigneeError) {
        throw new Error(assigneeError.message);
    }
}
