import { supabase } from '@/lib/supabase';
import type { CreateProjectInput, ProjectItem, ProjectMemberRole } from '@/types/project';

interface ProjectRow {
    id: string;
    name: string;
    description: string | null;
    members_count: number | null;
    start_date: string | null;
    end_date: string | null;
    is_favorite: boolean | null;
    category: string | null;
    theme_color: string | null;
    tags: string[] | null;
    visibility: 'private' | 'public' | null;
    created_at: string;
}

export interface ProjectMemberSeedInput {
    name: string;
    email?: string;
    role?: ProjectMemberRole;
}

const PROJECT_SELECT = [
    'id',
    'name',
    'description',
    'members_count',
    'start_date',
    'end_date',
    'is_favorite',
    'category',
    'theme_color',
    'tags',
    'visibility',
    'created_at',
].join(',');

const HEX_COLOR_PATTERN = /^#(?:[0-9a-fA-F]{3}){1,2}$/;

function toProjectItem(row: ProjectRow): ProjectItem {
    return {
        id: row.id,
        name: row.name,
        description: row.description ?? '',
        members: row.members_count ?? 0,
        startDate: row.start_date ?? '',
        endDate: row.end_date ?? '',
        isFavorite: row.is_favorite ?? false,
        category: row.category ?? '미분류',
        themeColor: row.theme_color ?? '#B95D69',
        tags: Array.isArray(row.tags) ? row.tags : [],
        visibility: row.visibility === 'public' ? 'public' : 'private',
        createdAt: row.created_at,
    };
}

function normalizeDate(value: string): string | null {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
}

function validateDateRange(startDate: string | null, endDate: string | null): void {
    if (startDate && endDate && startDate > endDate) {
        throw new Error('종료일은 시작일보다 빠를 수 없습니다.');
    }
}

function normalizeColor(color: string): string {
    const trimmed = color.trim();
    if (!HEX_COLOR_PATTERN.test(trimmed)) {
        return '#B95D69';
    }
    return trimmed;
}

function normalizeEmail(email?: string): string | null {
    if (!email) {
        return null;
    }

    const trimmed = email.trim().toLowerCase();
    return trimmed || null;
}

function normalizeMembers(members: ProjectMemberSeedInput[]): ProjectMemberSeedInput[] {
    const dedupe = new Map<string, ProjectMemberSeedInput>();

    members.forEach((member) => {
        const name = member.name.trim();
        if (!name) {
            return;
        }

        const email = normalizeEmail(member.email);
        const key = email ?? `name:${name.toLowerCase()}`;

        dedupe.set(key, {
            name,
            email: email ?? undefined,
            role: member.role === 'leader' ? 'leader' : 'member',
        });
    });

    return Array.from(dedupe.values());
}

export async function listProjects(): Promise<ProjectItem[]> {
    const { data, error } = await supabase
        .from('projects')
        .select(PROJECT_SELECT)
        .order('created_at', { ascending: false });

    if (error) {
        throw new Error(error.message);
    }

    const rows = ((data ?? []) as unknown) as ProjectRow[];
    return rows.map(toProjectItem);
}

export async function addProjectMembers(projectId: string, members: ProjectMemberSeedInput[]): Promise<void> {
    const normalizedMembers = normalizeMembers(members);

    if (normalizedMembers.length === 0) {
        return;
    }

    const { error } = await supabase
        .from('project_members')
        .upsert(
            normalizedMembers.map((member) => ({
                project_id: projectId,
                display_name: member.name,
                email: normalizeEmail(member.email),
                role: member.role === 'leader' ? 'leader' : 'member',
            })),
            {
                onConflict: 'project_id,display_name',
                ignoreDuplicates: true,
            }
        );

    if (error) {
        throw new Error(error.message);
    }
}

export async function createProject(input: CreateProjectInput): Promise<ProjectItem> {
    const startDate = normalizeDate(input.startDate);
    const endDate = normalizeDate(input.endDate);

    validateDateRange(startDate, endDate);

    const normalizedTags = Array.from(
        new Set(
            input.tags
                .map((tag) => tag.trim())
                .filter(Boolean)
        )
    );

    const payload = {
        name: input.name.trim(),
        description: input.description.trim() || null,
        members_count: 0,
        start_date: startDate,
        end_date: endDate,
        is_favorite: input.isFavorite,
        category: input.category.trim() || '미분류',
        theme_color: normalizeColor(input.themeColor),
        tags: normalizedTags,
        visibility: input.visibility,
    };

    if (!payload.name) {
        throw new Error('프로젝트 이름을 입력해 주세요.');
    }

    const { data, error } = await supabase
        .from('projects')
        .insert(payload)
        .select(PROJECT_SELECT)
        .single();

    if (error || !data) {
        throw new Error(error?.message ?? '프로젝트 생성에 실패했습니다.');
    }

    const projectRow = (data as unknown) as ProjectRow;

    await addProjectMembers(projectRow.id, input.initialMembers ?? []);

    const { data: refreshedProject, error: refreshError } = await supabase
        .from('projects')
        .select(PROJECT_SELECT)
        .eq('id', projectRow.id)
        .single();

    if (refreshError || !refreshedProject) {
        throw new Error(refreshError?.message ?? '프로젝트 정보를 갱신하지 못했습니다.');
    }

    return toProjectItem((refreshedProject as unknown) as ProjectRow);
}

export async function updateProjectFavorite(projectId: string, isFavorite: boolean): Promise<ProjectItem> {
    const { data, error } = await supabase
        .from('projects')
        .update({ is_favorite: isFavorite })
        .eq('id', projectId)
        .select(PROJECT_SELECT)
        .single();

    if (error || !data) {
        throw new Error(error?.message ?? '즐겨찾기 상태 변경에 실패했습니다.');
    }

    return toProjectItem((data as unknown) as ProjectRow);
}
