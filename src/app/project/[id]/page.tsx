'use client';

import React, { use, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { notFound, useRouter } from 'next/navigation';
import type { RealtimeChannel, RealtimePostgresInsertPayload } from '@supabase/supabase-js';
import {
    AlertCircle,
    Loader2,
    UserCheck,
    Users,
    Plus,
    PenTool,
    X,
    Pencil,
    Trash2,
    ShieldCheck,
} from 'lucide-react';
import { clsx } from 'clsx';
import { useUI } from '@/context/UIContext';
import { ProjectHeader } from '@/components/project/ProjectHeader';
import { ProjectItemCommentSection } from '@/components/project/ProjectItemCommentSection';
import { TaskCard } from '@/components/task/TaskCard';
import { CreatePostModal } from '@/components/modals/CreatePostModal';
import { TabSwiper } from '@/components/common/TabSwiper';
import {
    createProjectItemComment,
    createProjectBoardItem,
    updateProjectBoardItem,
    deleteProjectBoardItem,
    hasProjectItemByImageStoragePath,
    listProjectItemComments,
    listProjectBoardItems,
    listProjectMembers,
} from '@/lib/api/projectBoard';
import {
    createProjectInvitation,
    createProjectJoinRequest,
    getProjectAccess,
    leaveProject,
    listMyProjectInvitationsForUser,
    listProjectInvitations,
    listProjectJoinRequests,
    respondProjectInvitation,
    reviewJoinRequest,
    removeProjectMember,
    transferProjectLeader,
} from '@/lib/api/projectCollaboration';
import { addProjectMembers, deleteProject, getProjectByIdForViewer, updateProject, updateProjectFavorite } from '@/lib/api/projects';
import { toErrorMessage } from '@/lib/api/errors';
import { isAnomalyBlockedError } from '@/lib/api/client';
import { useAuth } from '@/context/AuthContext';
import {
    cleanupStoredImagePathSafely,
    ITEM_ATTACHMENT_MAX_COUNT,
    uploadOptimizedImage,
    uploadTaskAttachment,
} from '@/lib/storage/imageUpload';
import { listChatUsers } from '@/lib/api/chat';
import { supabase } from '@/lib/supabase';
import type {
    CreateProjectItemInput,
    ProjectMemberOption,
    ProjectItemComment,
    ProjectPost,
    Task,
    TaskAttachmentInput,
    TaskPriority,
    TaskStatus,
} from '@/types/workflow';
import type { ProjectInvitation, ProjectJoinRequest } from '@/types/collaboration';
import type { MemberRole } from '@/types/collaboration';
import type { ProjectItem } from '@/types/project';
import type { ChatUserItem } from '@/types/chat';

const STATUS_TABS = [
    { id: 'REQUEST', label: '요청' },
    { id: 'PROGRESS', label: '진행' },
    { id: 'FEEDBACK', label: '피드백' },
    { id: 'REVIEW', label: '검수완료' },
    { id: 'DONE', label: '완료' },
    { id: 'HOLD', label: '보류' },
    { id: 'ISSUE', label: '이슈' },
];

const CATEGORY_ALL_TAB = { id: 'ALL', label: '전체' };

const BOARD_TABS = [
    { id: 'TASK', label: '업무' },
    { id: 'POST', label: '글' },
];

type BoardTabType = 'TASK' | 'POST';
type BoardDetailType = 'TASK' | 'POST';

const STATUS_COLORS: Record<string, string> = {
    REQUEST: '#3B82F6',
    PROGRESS: '#F59E0B',
    FEEDBACK: '#8B5CF6',
    REVIEW: '#06B6D4',
    DONE: '#059669',
    ISSUE: '#EF4444',
    HOLD: '#6B7280',
};

const PRIORITY_LABELS: Record<TaskPriority, string> = {
    URGENT: '긴급',
    HIGH: '높음',
    NORMAL: '보통',
    LOW: '낮음',
};

const TASK_PROGRESS_STEPS = [0, 20, 40, 60, 80, 100];

const HANGUL_BASE_CODE = 0xac00;
const HANGUL_LAST_CODE = 0xd7a3;
const HANGUL_INITIALS = [
    'ㄱ',
    'ㄲ',
    'ㄴ',
    'ㄷ',
    'ㄸ',
    'ㄹ',
    'ㅁ',
    'ㅂ',
    'ㅃ',
    'ㅅ',
    'ㅆ',
    'ㅇ',
    'ㅈ',
    'ㅉ',
    'ㅊ',
    'ㅋ',
    'ㅌ',
    'ㅍ',
    'ㅎ',
];

function normalizeSearchKeyword(value: string): string {
    return value.trim().toLowerCase().replace(/\s+/g, '');
}

function extractHangulInitials(value: string): string {
    const chars: string[] = [];
    for (const letter of value) {
        const code = letter.charCodeAt(0);
        if (code >= HANGUL_BASE_CODE && code <= HANGUL_LAST_CODE) {
            const initialIndex = Math.floor((code - HANGUL_BASE_CODE) / 588);
            chars.push(HANGUL_INITIALS[initialIndex] ?? letter);
            continue;
        }
        chars.push(letter.toLowerCase());
    }
    return chars.join('');
}

function formatCandidateLabel(candidate: ChatUserItem): string {
    return `${candidate.displayName} - ${candidate.email}`;
}

function matchesCandidateName(keyword: string, candidate: ChatUserItem): boolean {
    const normalizedKeyword = normalizeSearchKeyword(keyword);
    if (!normalizedKeyword) {
        return false;
    }

    const displayName = normalizeSearchKeyword(candidate.displayName);
    const email = normalizeSearchKeyword(candidate.email);
    if (displayName.includes(normalizedKeyword) || email.includes(normalizedKeyword)) {
        return true;
    }

    return extractHangulInitials(candidate.displayName).replace(/\s+/g, '').includes(normalizedKeyword);
}

interface ProjectItemCommentRealtimeRow {
    id: string;
    project_id: string;
    item_id: string;
    parent_comment_id: string | null;
    author_user_id: string | null;
    author_name: string;
    body: string;
    created_at: string;
}

function SectionTitle({ title, rightSlot }: { title: string; rightSlot?: React.ReactNode }) {
    return (
        <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-bold text-gray-800">{title}</h3>
            {rightSlot}
        </div>
    );
}

function ThinTab({ isActive, color, children, onClick }: {
    isActive: boolean;
    color: string;
    children: React.ReactNode;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={clsx(
                'px-4 py-2.5 text-sm whitespace-nowrap transition-all border-b',
                isActive ? 'font-semibold text-gray-900 border-b-2' : 'text-gray-400 hover:text-gray-600 border-b-transparent',
            )}
            style={isActive ? { borderColor: color } : undefined}
        >
            {children}
        </button>
    );
}

function getTaskStatusLabel(status: string): string {
    return STATUS_TABS.find((tab) => tab.id === status)?.label ?? status;
}

function getTaskPriorityLabel(priority: string): string {
    return PRIORITY_LABELS[priority as TaskPriority] ?? priority;
}

export default function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
    const resolvedParams = use(params);
    const { id } = resolvedParams;
    const router = useRouter();
    const { projects, refreshProjects, toggleProjectFavorite, searchKeyword, setSearchKeyword } = useUI();
    const { user, displayName, isAuthenticated, profile } = useAuth();

    const projectFromList = useMemo(
        () => projects.find((currentProject) => currentProject.id === id),
        [projects, id]
    );

    const [project, setProject] = useState(projectFromList ?? null);
    const [projectRole, setProjectRole] = useState<MemberRole | null>(null);
    const [isProjectAdmin, setIsProjectAdmin] = useState(false);
    const [activeBoardTab, setActiveBoardTab] = useState<BoardTabType>('TASK');
    const [activeStatusTab, setActiveStatusTab] = useState('REQUEST');
    const [taskStatusFilter, setTaskStatusFilter] = useState('ALL');
    const [activeCategoryTab, setActiveCategoryTab] = useState('ALL');

    const [tasks, setTasks] = useState<Task[]>([]);
    const [posts, setPosts] = useState<ProjectPost[]>([]);
    const [commentsByItemId, setCommentsByItemId] = useState<Record<string, ProjectItemComment[]>>({});
    const [memberOptions, setMemberOptions] = useState<ProjectMemberOption[]>([]);
    const [invitations, setInvitations] = useState<ProjectInvitation[]>([]);
    const [joinRequests, setJoinRequests] = useState<ProjectJoinRequest[]>([]);
    const [myInvitations, setMyInvitations] = useState<ProjectInvitation[]>([]);

    const [isBoardLoading, setIsBoardLoading] = useState(true);
    const [isProjectLoading, setIsProjectLoading] = useState(true);
    const [boardError, setBoardError] = useState<string | null>(null);
    const [projectError, setProjectError] = useState<string | null>(null);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [boardDetailState, setBoardDetailState] = useState<null | { type: BoardDetailType; itemId: string }>(null);
    const [editingBoardItem, setEditingBoardItem] = useState<null | {
        id: string;
        type: 'TASK' | 'POST';
        title: string;
        content: string;
        imageUrl?: string | null;
        imageOriginalFilename?: string | null;
        imageStoredFilename?: string | null;
        imageStoragePath?: string | null;
        imageSizeBytes?: number | null;
        attachments?: TaskAttachmentInput[];
        status?: TaskStatus;
        priority?: TaskPriority;
        assignees?: string[];
        startDate?: string;
        endDate?: string;
        category?: string;
    }>(null);
    const [isProjectFormOpen, setIsProjectFormOpen] = useState(false);
    const [isTagComposing, setIsTagComposing] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isFavoriteUpdating, setIsFavoriteUpdating] = useState(false);
    const [isActionSubmitting, setIsActionSubmitting] = useState(false);
    const [isDetailTaskMetaSubmitting, setIsDetailTaskMetaSubmitting] = useState(false);
    const [isProjectSubmitting, setIsProjectSubmitting] = useState(false);
    const [isProjectSettingsModalOpen, setIsProjectSettingsModalOpen] = useState(false);
    const [isProjectSettingsSubmitting, setIsProjectSettingsSubmitting] = useState(false);
    const [projectSettingsTab, setProjectSettingsTab] = useState<'BASIC' | 'MANAGE'>('BASIC');
    const initializedBoardProjectIdRef = useRef<string | null>(null);
    const commentsByItemIdRef = useRef<Record<string, ProjectItemComment[]>>({});
    const commentsRealtimeChannelRef = useRef<RealtimeChannel | null>(null);
    const boardItemsRealtimeChannelRef = useRef<RealtimeChannel | null>(null);

    const [inviteForm, setInviteForm] = useState({ name: '', email: '', message: '' });
    const [joinForm, setJoinForm] = useState({ message: '' });
    const [transferMemberId, setTransferMemberId] = useState('');
    const [isDeletingProject, setIsDeletingProject] = useState(false);
    const [isLeavingProject, setIsLeavingProject] = useState(false);
    const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [deleteConfirmInput, setDeleteConfirmInput] = useState('');
    const [projectTagInput, setProjectTagInput] = useState('');
    const [projectForm, setProjectForm] = useState({
        name: '',
        description: '',
        category: '',
        status: 'REQUEST' as TaskStatus,
        startDate: '',
        endDate: '',
        visibility: 'private' as 'private' | 'public',
        themeColor: '#B95D69',
        tags: [] as string[],
    });
    const [projectSettingsCandidates, setProjectSettingsCandidates] = useState<ChatUserItem[]>([]);
    const [isProjectSettingsCandidatesLoading, setIsProjectSettingsCandidatesLoading] = useState(false);
    const [projectSettingsCandidatesError, setProjectSettingsCandidatesError] = useState<string | null>(null);
    const [projectSettingsMemberInput, setProjectSettingsMemberInput] = useState('');
    const [isProjectSettingsMemberInputFocused, setIsProjectSettingsMemberInputFocused] = useState(false);
    const [isProjectSettingsMemberComposing, setIsProjectSettingsMemberComposing] = useState(false);
    const [projectSettingsSelectedUserIds, setProjectSettingsSelectedUserIds] = useState<string[]>([]);

    const THEME_COLORS = useMemo(
        () => ['#B95D69', '#E08D79', '#D4AF37', '#8FBC8F', '#87CEEB', '#4A90D9', '#708090'],
        []
    );

    const viewerEmail = profile?.email ?? user?.email ?? '';
    const isMember = Boolean(projectRole);
    const isLeader = projectRole === 'leader';
    const showProjectManagementPanels = false;
    const canCreateBoard = isAuthenticated && (isMember || isProjectAdmin);
    const canToggleFavorite = isAuthenticated;
    const canManageProject = isLeader || isProjectAdmin;
    const myPendingInvitation = myInvitations.find((invitation) => invitation.status === 'PENDING');
    const hasPendingMyInvitation = Boolean(myPendingInvitation);
    const [isChangingProjectStatus, setIsChangingProjectStatus] = useState(false);
    const projectDepartmentTabs = useMemo(() => {
        const uniqueTags = Array.from(
            new Set(
                (project?.tags ?? [])
                    .map((tag) => tag.trim())
                    .filter(Boolean)
            )
        );

        if (uniqueTags.length > 0) {
            return uniqueTags.map((tag) => ({ id: tag, label: tag }));
        }

        const fallbackCategory = project?.category?.trim();
        if (fallbackCategory) {
            return [{ id: fallbackCategory, label: fallbackCategory }];
        }

        return [{ id: '미분류', label: '미분류' }];
    }, [project?.tags, project?.category]);
    const categoryTabs = useMemo(
        () => [CATEGORY_ALL_TAB, ...projectDepartmentTabs],
        [projectDepartmentTabs]
    );

    const transferCandidateMembers = useMemo(
        () => memberOptions.filter((member) => member.role !== 'leader' && Boolean(member.userId)),
        [memberOptions]
    );
    const assigneeOptions = useMemo(
        () => memberOptions.filter((member) => Boolean(member.userId)),
        [memberOptions]
    );
    const currentParticipantMembers = useMemo(
        () => memberOptions.filter((member) => member.role !== 'leader' && Boolean(member.userId)),
        [memberOptions]
    );
    const projectSettingsSelectedMembers = useMemo(
        () =>
            projectSettingsSelectedUserIds
                .map((userId) => {
                    const candidate = projectSettingsCandidates.find((item) => item.userId === userId);
                    if (candidate) {
                        return candidate;
                    }

                    const existingMember = currentParticipantMembers.find((member) => member.userId === userId);
                    if (!existingMember) {
                        return null;
                    }

                    return {
                        userId,
                        displayName: existingMember.name,
                        fullName: existingMember.name,
                        nickname: existingMember.name,
                        email: existingMember.email ?? '',
                        phoneNumber: '',
                        avatarUrl: null,
                    } as ChatUserItem;
                })
                .filter((member): member is ChatUserItem => Boolean(member)),
        [currentParticipantMembers, projectSettingsCandidates, projectSettingsSelectedUserIds]
    );
    const filteredProjectSettingsCandidates = useMemo(() => {
        const query = normalizeSearchKeyword(projectSettingsMemberInput);
        if (!query) {
            return [] as ChatUserItem[];
        }

        const selectedSet = new Set(projectSettingsSelectedUserIds);
        return projectSettingsCandidates
            .filter((candidate) => {
                if (!candidate.userId || selectedSet.has(candidate.userId)) {
                    return false;
                }
                return matchesCandidateName(query, candidate);
            })
            .slice(0, 12);
    }, [projectSettingsCandidates, projectSettingsMemberInput, projectSettingsSelectedUserIds]);
    const showProjectSettingsSuggestions = isProjectSettingsMemberInputFocused && projectSettingsMemberInput.trim().length > 0;

    const appendCommentToBoardState = useCallback((comment: ProjectItemComment) => {
        const currentByItem = commentsByItemIdRef.current[comment.itemId] ?? [];
        if (currentByItem.some((entry) => entry.id === comment.id)) {
            return;
        }

        const nextByItem = [...currentByItem, comment];
        commentsByItemIdRef.current = {
            ...commentsByItemIdRef.current,
            [comment.itemId]: nextByItem,
        };

        setCommentsByItemId((prev) => ({
            ...prev,
            [comment.itemId]: nextByItem,
        }));
        setTasks((prev) => prev.map((task) => (
            task.id === comment.itemId
                ? { ...task, commentCount: task.commentCount + 1 }
                : task
        )));
        setPosts((prev) => prev.map((post) => (
            post.id === comment.itemId
                ? { ...post, commentCount: post.commentCount + 1 }
                : post
        )));
    }, []);

    useEffect(() => {
        if (!isProjectSettingsModalOpen) {
            return;
        }

        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        return () => {
            document.body.style.overflow = previousOverflow;
        };
    }, [isProjectSettingsModalOpen]);

    useEffect(() => {
        commentsByItemIdRef.current = commentsByItemId;
    }, [commentsByItemId]);

    const canDeleteTask = (task: Task) =>
        isAuthenticated
        && (
            isProjectAdmin
            || isLeader
            || (Boolean(user?.id) && task.author.id === user?.id)
        );
    const canEditTask = canDeleteTask;
    const canQuickUpdateTaskMeta = useCallback((task: Task) =>
        isAuthenticated && (isProjectAdmin || isMember || task.assignees.some((assignee) => assignee.userId && assignee.userId === user?.id)),
        [isAuthenticated, isMember, isProjectAdmin, user?.id]);
    const canDeletePost = (post: ProjectPost) =>
        isAuthenticated
        && (
            isProjectAdmin
            || isLeader
            || (Boolean(post.authorId) && post.authorId === user?.id)
        );
    const canEditPost = canDeletePost;

    const syncProjectForm = (sourceProject: ProjectItem | null) => {
        if (!sourceProject) {
            return;
        }

        setProjectForm({
            name: sourceProject.name,
            description: sourceProject.description,
            category: sourceProject.category,
            status: sourceProject.status ?? 'REQUEST',
            startDate: sourceProject.startDate || '',
            endDate: sourceProject.endDate || '',
            visibility: sourceProject.visibility,
            themeColor: sourceProject.themeColor || '#B95D69',
            tags: sourceProject.tags,
        });
        setProjectTagInput('');
    };

    const resetProjectEditForm = () => {
        syncProjectForm(project);
    };

    const refreshAccess = useCallback(async () => {
        if (!project) {
            return null;
        }

        const access = await getProjectAccess(project.id, {
            userId: user?.id,
            email: viewerEmail,
        });
        setProjectRole(access.role);
        setIsProjectAdmin(access.isAdmin);

        return access;
    }, [project, user?.id, viewerEmail]);

    const loadProjectBoard = useCallback(async (projectId: string, forceMemberList = false) => {
        const [boardItems, members] = await Promise.all([
            listProjectBoardItems(projectId),
            forceMemberList ? listProjectMembers(projectId) : Promise.resolve<ProjectMemberOption[]>([]),
        ]);

        setTasks(boardItems.tasks);
        setPosts(boardItems.posts);

        const itemIds = [
            ...boardItems.tasks.map((task) => task.id),
            ...boardItems.posts.map((post) => post.id),
        ];

        if (itemIds.length === 0) {
            commentsByItemIdRef.current = {};
            setCommentsByItemId({});
        } else {
            try {
                const comments = await listProjectItemComments(projectId, itemIds);
                const grouped = comments.reduce<Record<string, ProjectItemComment[]>>((acc, comment) => {
                    if (!acc[comment.itemId]) {
                        acc[comment.itemId] = [];
                    }
                    acc[comment.itemId] = [...acc[comment.itemId], comment];
                    return acc;
                }, {});
                commentsByItemIdRef.current = grouped;
                setCommentsByItemId(grouped);
            } catch (error) {
                if (isAnomalyBlockedError(error)) {
                    commentsByItemIdRef.current = {};
                    setCommentsByItemId({});
                } else {
                    commentsByItemIdRef.current = {};
                    setCommentsByItemId({});
                }
            }
        }

        if (forceMemberList) {
            setMemberOptions(members);
            setProject((current) => {
                if (!current) {
                    return current;
                }
                return {
                    ...current,
                    members: members.length,
                };
            });
            return;
        }

        setMemberOptions([]);
    }, []);

    const loadProjectMeta = useCallback(async (projectId: string, canManage: boolean) => {
        const [projectInvitations, myPendingInvitations, joinRequestRows] = await Promise.all([
            canManage ? listProjectInvitations(projectId) : Promise.resolve<ProjectInvitation[]>([]),
            isAuthenticated
                ? listMyProjectInvitationsForUser({ userId: user?.id, email: viewerEmail })
                    .then((rows) => rows.filter((invitation) => invitation.projectId === projectId))
                : Promise.resolve<ProjectInvitation[]>([]),
            canManage ? listProjectJoinRequests(projectId) : Promise.resolve<ProjectJoinRequest[]>([]),
        ]);

        setInvitations(projectInvitations);
        setMyInvitations(myPendingInvitations.filter((invitation) => invitation.status === 'PENDING'));
        setJoinRequests(joinRequestRows.filter((request) => request.status === 'PENDING'));
    }, [isAuthenticated, user?.id, viewerEmail]);

    const refreshBoard = useCallback(async () => {
        if (!project) {
            return;
        }

        setIsBoardLoading(true);
        try {
            const access = await refreshAccess();
            const canManage = Boolean(access && (access.role === 'leader' || access.isAdmin));
            await Promise.all([
                loadProjectBoard(project.id, true),
                loadProjectMeta(project.id, canManage),
            ]);
            setBoardError(null);
        } catch (error) {
            if (isAnomalyBlockedError(error)) {
                setBoardError(null);
                return;
            }
            setBoardError(toErrorMessage(error, '프로젝트 보드 데이터를 다시 불러오지 못했습니다.'));
        } finally {
            setIsBoardLoading(false);
        }
    }, [project, refreshAccess, loadProjectBoard, loadProjectMeta]);

    useEffect(() => {
        const membership = { userId: user?.id, email: viewerEmail };
        let isActive = true;

        const initializeProject = async () => {
            setIsProjectLoading(true);
            setProjectError(null);

            try {
                const loaded = await getProjectByIdForViewer(id, membership);
                if (!isActive) return;

                setProject(loaded);
                if (!loaded) {
                    setIsProjectLoading(false);
                    return;
                }

                const access = await getProjectAccess(loaded.id, membership);
                if (!isActive) return;
                setProjectRole(access.role);
                setIsProjectAdmin(access.isAdmin);
                syncProjectForm(loaded);
            } catch (error) {
                if (!isActive) return;
                if (isAnomalyBlockedError(error)) {
                    setProjectError(null);
                    return;
                }
                setProjectError(toErrorMessage(error, '프로젝트 접근 정보를 불러오지 못했습니다.'));
            } finally {
                if (!isActive) return;
                setIsProjectLoading(false);
            }
        };

        void initializeProject();

        return () => {
            isActive = false;
        };
    }, [id, user?.id, viewerEmail]);

    useEffect(() => {
        if (!project || isProjectLoading) {
            return;
        }

        if (initializedBoardProjectIdRef.current === project.id) {
            return;
        }

        initializedBoardProjectIdRef.current = project.id;
        void refreshBoard();
    }, [project, isProjectLoading, refreshBoard]);

    useEffect(() => {
        const isCurrentCategoryValid = categoryTabs.some((tab) => tab.id === activeCategoryTab);
        if (!isCurrentCategoryValid) {
            setActiveCategoryTab('ALL');
        }
    }, [categoryTabs, activeCategoryTab]);

    useEffect(() => {
        const projectId = project?.id;
        if (!projectId || !isAuthenticated) {
            if (commentsRealtimeChannelRef.current) {
                void supabase.removeChannel(commentsRealtimeChannelRef.current);
                commentsRealtimeChannelRef.current = null;
            }
            return;
        }

        if (commentsRealtimeChannelRef.current) {
            void supabase.removeChannel(commentsRealtimeChannelRef.current);
            commentsRealtimeChannelRef.current = null;
        }

        const channel = supabase
            .channel(`project:comments:${projectId}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'project_item_comments',
                    filter: `project_id=eq.${projectId}`,
                },
                (payload: RealtimePostgresInsertPayload<ProjectItemCommentRealtimeRow>) => {
                    const inserted = payload.new;
                    if (!inserted?.id || !inserted?.item_id) {
                        return;
                    }

                    appendCommentToBoardState({
                        id: inserted.id,
                        projectId: inserted.project_id,
                        itemId: inserted.item_id,
                        parentCommentId: inserted.parent_comment_id ?? null,
                        authorUserId: inserted.author_user_id ?? null,
                        authorName: inserted.author_name || '익명',
                        body: inserted.body || '',
                        createdAt: inserted.created_at,
                    });
                }
            );

        commentsRealtimeChannelRef.current = channel;
        channel.subscribe();

        return () => {
            if (commentsRealtimeChannelRef.current === channel) {
                commentsRealtimeChannelRef.current = null;
            }
            void supabase.removeChannel(channel);
        };
    }, [appendCommentToBoardState, isAuthenticated, project?.id]);

    // ── project_items Realtime (업무/글 실시간 동기화) ──
    useEffect(() => {
        const projectId = project?.id;
        if (!projectId || !isAuthenticated) {
            if (boardItemsRealtimeChannelRef.current) {
                void supabase.removeChannel(boardItemsRealtimeChannelRef.current);
                boardItemsRealtimeChannelRef.current = null;
            }
            return;
        }

        if (boardItemsRealtimeChannelRef.current) {
            void supabase.removeChannel(boardItemsRealtimeChannelRef.current);
            boardItemsRealtimeChannelRef.current = null;
        }

        let debounceTimer: ReturnType<typeof setTimeout> | null = null;

        const channel = supabase
            .channel(`project:items:${projectId}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'project_items',
                    filter: `project_id=eq.${projectId}`,
                },
                () => {
                    if (debounceTimer) clearTimeout(debounceTimer);
                    debounceTimer = setTimeout(() => {
                        debounceTimer = null;
                        void refreshBoard();
                    }, 300);
                }
            );

        boardItemsRealtimeChannelRef.current = channel;
        channel.subscribe();

        return () => {
            if (debounceTimer) clearTimeout(debounceTimer);
            if (boardItemsRealtimeChannelRef.current === channel) {
                boardItemsRealtimeChannelRef.current = null;
            }
            void supabase.removeChannel(channel);
        };
    }, [isAuthenticated, project?.id, refreshBoard]);

    const filteredTasks = useMemo(
        () => {
            const keyword = searchKeyword.trim().toLowerCase();
            return tasks.filter((task) => {
                const isStatusMatched = taskStatusFilter === 'ALL' || task.status === taskStatusFilter;
                const isCategoryMatched = activeCategoryTab === 'ALL' || task.category === activeCategoryTab;
                const isSearchMatched = !keyword || task.title.toLowerCase().includes(keyword) || task.content.toLowerCase().includes(keyword);
                return isStatusMatched && isCategoryMatched && isSearchMatched;
            });
        },
        [tasks, taskStatusFilter, activeCategoryTab, searchKeyword]
    );

    const filteredPosts = useMemo(
        () => {
            const keyword = searchKeyword.trim().toLowerCase();
            return posts.filter((post) => {
                const isCategoryMatched = activeCategoryTab === 'ALL' || post.category === activeCategoryTab;
                const isSearchMatched = !keyword || post.title.toLowerCase().includes(keyword) || post.content.toLowerCase().includes(keyword);
                return isCategoryMatched && isSearchMatched;
            });
        },
        [posts, activeCategoryTab, searchKeyword]
    );
    const selectedTaskForDetail = useMemo(
        () => (boardDetailState?.type === 'TASK'
            ? tasks.find((task) => task.id === boardDetailState.itemId) ?? null
            : null),
        [boardDetailState, tasks]
    );
    const selectedPostForDetail = useMemo(
        () => (boardDetailState?.type === 'POST'
            ? posts.find((post) => post.id === boardDetailState.itemId) ?? null
            : null),
        [boardDetailState, posts]
    );
    const selectedDetailItem = selectedTaskForDetail ?? selectedPostForDetail;
    const selectedDetailComments = useMemo(
        () => (boardDetailState ? commentsByItemId[boardDetailState.itemId] ?? [] : []),
        [boardDetailState, commentsByItemId]
    );
    const detailTaskProgressTabs = useMemo(() => {
        if (!selectedTaskForDetail) {
            return TASK_PROGRESS_STEPS.map((progress) => ({ id: String(progress), label: `${progress}%` }));
        }

        const set = new Set<number>(TASK_PROGRESS_STEPS);
        set.add(Math.max(0, Math.min(100, Math.round(selectedTaskForDetail.progress))));
        return Array.from(set)
            .sort((a, b) => a - b)
            .map((progress) => ({ id: String(progress), label: `${progress}%` }));
    }, [selectedTaskForDetail]);

    useEffect(() => {
        if (!boardDetailState) {
            return;
        }

        if (boardDetailState.type === 'TASK') {
            const exists = tasks.some((task) => task.id === boardDetailState.itemId);
            if (!exists) {
                setBoardDetailState(null);
            }
            return;
        }

        const exists = posts.some((post) => post.id === boardDetailState.itemId);
        if (!exists) {
            setBoardDetailState(null);
        }
    }, [boardDetailState, posts, tasks]);

    const boardHasError = Boolean(boardError);
    const taskStatusAndCategoryFiltered = taskStatusFilter !== 'ALL' || activeCategoryTab !== 'ALL';
    const postCategoryFiltered = activeCategoryTab !== 'ALL';
    const taskEmptyMessage = taskStatusAndCategoryFiltered ? '선택한 상태/카테고리에 맞는 업무가 없습니다.' : '현재 업무가 존재하지 않습니다.';
    const postEmptyMessage = postCategoryFiltered ? '선택한 말머리에 맞는 글이 없습니다.' : '현재 글이 존재하지 않습니다.';

    const toErrorText = (message: string | null) => message ? `[error] ${message}` : '';

    const handleRetry = async () => {
        await refreshBoard();
    };

    const openBoardDetail = useCallback((type: BoardDetailType, itemId: string) => {
        setBoardDetailState({ type, itemId });
    }, []);

    const closeBoardDetail = useCallback(() => {
        setBoardDetailState(null);
    }, []);

    const loadProjectSettingsCandidates = useCallback(async () => {
        if (!isAuthenticated || !user?.id) {
            setProjectSettingsCandidates([]);
            setProjectSettingsCandidatesError(null);
            setIsProjectSettingsCandidatesLoading(false);
            return;
        }

        setIsProjectSettingsCandidatesLoading(true);
        setProjectSettingsCandidatesError(null);
        try {
            const rows = await listChatUsers(user.id);
            setProjectSettingsCandidates(rows);
        } catch (error) {
            if (isAnomalyBlockedError(error)) {
                setProjectSettingsCandidates([]);
                setProjectSettingsCandidatesError(null);
                return;
            }
            setProjectSettingsCandidates([]);
            setProjectSettingsCandidatesError(toErrorMessage(error, '참여 멤버 목록을 불러오지 못했습니다.'));
        } finally {
            setIsProjectSettingsCandidatesLoading(false);
        }
    }, [isAuthenticated, user?.id]);

    const openProjectSettingsModal = async () => {
        if (!canManageProject || !project) {
            return;
        }

        let nextParticipantUserIds = currentParticipantMembers
            .map((member) => member.userId ?? '')
            .filter(Boolean);

        try {
            const latestMembers = await listProjectMembers(project.id);
            setMemberOptions(latestMembers);
            setProject((current) => {
                if (!current) {
                    return current;
                }
                return {
                    ...current,
                    members: latestMembers.length,
                };
            });
            nextParticipantUserIds = latestMembers
                .filter((member) => member.role !== 'leader' && Boolean(member.userId))
                .map((member) => member.userId ?? '')
                .filter(Boolean);
        } catch (error) {
            if (!isAnomalyBlockedError(error)) {
                setBoardError(toErrorMessage(error, '프로젝트 멤버 정보를 불러오지 못했습니다.'));
            }
        }

        syncProjectForm(project);
        setProjectSettingsSelectedUserIds(nextParticipantUserIds);
        setProjectSettingsMemberInput('');
        setIsProjectSettingsMemberInputFocused(false);
        setIsProjectSettingsMemberComposing(false);
        setProjectSettingsTab('BASIC');
        setIsProjectSettingsModalOpen(true);
        void loadProjectMeta(project.id, true);
        void loadProjectSettingsCandidates();
    };

    const closeProjectSettingsModal = () => {
        if (isProjectSettingsSubmitting) {
            return;
        }
        setProjectSettingsTab('BASIC');
        setIsProjectSettingsModalOpen(false);
    };

    const handleSelectProjectSettingsMember = (candidate: ChatUserItem) => {
        if (!candidate.userId || projectSettingsSelectedUserIds.includes(candidate.userId)) {
            setProjectSettingsMemberInput('');
            return;
        }

        setProjectSettingsSelectedUserIds((prev) => [...prev, candidate.userId]);
        setProjectSettingsMemberInput('');
    };

    const handleRemoveProjectSettingsMember = (userId: string) => {
        setProjectSettingsSelectedUserIds((prev) => prev.filter((id) => id !== userId));
    };

    const handleProjectSettingsMemberKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        const nativeEvent = e.nativeEvent as KeyboardEvent & { isComposing?: boolean };
        if (isProjectSettingsMemberComposing || nativeEvent.isComposing || e.key !== 'Enter') {
            return;
        }

        e.preventDefault();
        if (filteredProjectSettingsCandidates.length === 0) {
            alert('참여 멤버는 목록에서 선택해 주세요.');
            return;
        }

        handleSelectProjectSettingsMember(filteredProjectSettingsCandidates[0]);
    };

    const handleSaveProjectSettings = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!project || !user || !canManageProject) {
            return;
        }

        const name = projectForm.name.trim();
        if (!name) {
            alert('프로젝트 이름은 필수입니다.');
            return;
        }

        if (!/^#(?:[0-9a-fA-F]{3}){1,2}$/.test(projectForm.themeColor)) {
            alert('컬러 코드는 #000000 형식이어야 합니다.');
            return;
        }

        const currentParticipantByUserId = new Map(
            currentParticipantMembers
                .filter((member) => member.userId)
                .map((member) => [member.userId as string, member])
        );
        const currentUserIdSet = new Set(currentParticipantByUserId.keys());
        const nextUserIdSet = new Set(projectSettingsSelectedUserIds.filter(Boolean));

        const userIdsToAdd = Array.from(nextUserIdSet).filter((userId) => !currentUserIdSet.has(userId));
        const memberIdsToRemove = Array.from(currentParticipantByUserId.entries())
            .filter(([userId]) => !nextUserIdSet.has(userId))
            .map(([, member]) => member.id);

        try {
            setIsProjectSettingsSubmitting(true);

            const updatedProject = await updateProject(
                project.id,
                {
                    name,
                    description: projectForm.description.trim(),
                    category: projectForm.category.trim(),
                    themeColor: projectForm.themeColor,
                    tags: projectForm.tags,
                    visibility: projectForm.visibility,
                },
                { userId: user.id, email: viewerEmail }
            );

            if (userIdsToAdd.length > 0) {
                const rowsToAdd = userIdsToAdd.map((userId) => {
                    const candidate = projectSettingsCandidates.find((item) => item.userId === userId);
                    const fallbackMember = currentParticipantByUserId.get(userId);
                    return {
                        userId,
                        name: candidate?.displayName?.trim() || fallbackMember?.name || '사용자',
                        email: candidate?.email?.trim() || fallbackMember?.email || undefined,
                    };
                });
                await addProjectMembers(project.id, rowsToAdd);
            }

            if (memberIdsToRemove.length > 0) {
                await Promise.all(
                    memberIdsToRemove.map((memberId) =>
                        removeProjectMember(project.id, memberId, {
                            userId: user.id,
                            displayName,
                        })
                    )
                );
            }

            setProject(updatedProject);
            syncProjectForm(updatedProject);
            await refreshProjects();
            await refreshBoard();
            setIsProjectSettingsModalOpen(false);
        } catch (error) {
            if (isAnomalyBlockedError(error)) {
                return;
            }
            alert(toErrorMessage(error, '프로젝트 설정 저장에 실패했습니다.'));
        } finally {
            setIsProjectSettingsSubmitting(false);
        }
    };

    const openCreateBoardItem = () => {
        if (!canCreateBoard) {
            if (!isAuthenticated) {
                alert('로그인이 필요합니다.');
            } else {
                alert('프로젝트 멤버만 작성할 수 있습니다.');
            }
            return;
        }

        setEditingBoardItem(null);
        setIsCreateModalOpen(true);
    };

    const handleSubmitBoardItem = async (data: CreateProjectItemInput): Promise<boolean> => {
        if (!project || isSubmitting) {
            return false;
        }
        if (!user) {
            alert('로그인이 필요합니다.');
            return false;
        }

        if (!canCreateBoard && !editingBoardItem) {
            alert('프로젝트 멤버만 작성 가능합니다.');
            return false;
        }

        let uploadedImage: Awaited<ReturnType<typeof uploadOptimizedImage>> | null = null;
        const uploadedItemAttachments: Awaited<ReturnType<typeof uploadTaskAttachment>>[] = [];
        const previousImagePath = editingBoardItem?.imageStoragePath?.trim() || null;
        const previousAttachmentPaths = Array.isArray(editingBoardItem?.attachments)
            ? editingBoardItem.attachments
                .map((attachment) => attachment.storagePath.trim())
                .filter(Boolean)
            : [];
        let hasCommittedBoardItem = false;

        try {
            setIsSubmitting(true);
            const payload: CreateProjectItemInput = { ...data };

            const retainedAttachments = Array.isArray(data.retainedAttachments)
                ? data.retainedAttachments
                : (Array.isArray(data.taskRetainedAttachments) ? data.taskRetainedAttachments : []);
            const attachmentFiles = Array.isArray(data.attachmentFiles)
                ? data.attachmentFiles
                : (Array.isArray(data.taskAttachmentFiles) ? data.taskAttachmentFiles : []);

            if (retainedAttachments.length + attachmentFiles.length > ITEM_ATTACHMENT_MAX_COUNT) {
                alert(`첨부 파일은 최대 ${ITEM_ATTACHMENT_MAX_COUNT}개까지 등록할 수 있습니다.`);
                return false;
            }

            for (const file of attachmentFiles) {
                const uploaded = await uploadTaskAttachment({
                    file,
                    userId: user.id,
                });
                uploadedItemAttachments.push(uploaded);
            }

            payload.attachments = [
                ...retainedAttachments,
                ...uploadedItemAttachments.map((attachment) => ({
                    fileUrl: attachment.publicUrl,
                    originalFilename: attachment.originalFilename,
                    storedFilename: attachment.storedFilename,
                    storagePath: attachment.storagePath,
                    fileSizeBytes: attachment.sizeBytes,
                    mimeType: attachment.mimeType,
                })),
            ];

            if (data.imageFile) {
                uploadedImage = await uploadOptimizedImage({
                    file: data.imageFile,
                    userId: user.id,
                    folder: 'project_items',
                });

                payload.imageUrl = uploadedImage.publicUrl;
                payload.imageOriginalFilename = uploadedImage.originalFilename;
                payload.imageStoredFilename = uploadedImage.storedFilename;
                payload.imageStoragePath = uploadedImage.storagePath;
                payload.imageSizeBytes = uploadedImage.sizeBytes;
                payload.removeImage = false;
            } else if (editingBoardItem) {
                payload.imageUrl = editingBoardItem.imageUrl ?? null;
                payload.imageOriginalFilename = editingBoardItem.imageOriginalFilename ?? null;
                payload.imageStoredFilename = editingBoardItem.imageStoredFilename ?? null;
                payload.imageStoragePath = editingBoardItem.imageStoragePath ?? null;
                payload.imageSizeBytes = editingBoardItem.imageSizeBytes ?? null;
            }

            delete payload.imageFile;
            delete payload.attachmentFiles;
            delete payload.retainedAttachments;
            delete payload.taskAttachmentFiles;
            delete payload.taskRetainedAttachments;

            if (editingBoardItem) {
                await updateProjectBoardItem(project.id, editingBoardItem.id, payload, { id: user.id, name: displayName, email: viewerEmail });
            } else {
                await createProjectBoardItem(project.id, payload, { id: user.id, name: displayName, email: viewerEmail });
            }
            hasCommittedBoardItem = true;

            if (previousImagePath && (data.removeImage || (uploadedImage && uploadedImage.storagePath !== previousImagePath))) {
                void cleanupStoredImagePathSafely(previousImagePath);
            }

            if (editingBoardItem) {
                const retainedPathSet = new Set(
                    (payload.attachments ?? [])
                        .map((attachment) => attachment.storagePath.trim())
                        .filter(Boolean)
                );
                for (const previousPath of previousAttachmentPaths) {
                    if (!retainedPathSet.has(previousPath)) {
                        void cleanupStoredImagePathSafely(previousPath);
                    }
                }
            }

            try {
                await refreshBoard();
            } catch (refreshError) {
                if (isAnomalyBlockedError(refreshError)) {
                    setBoardError(null);
                } else {
                    setBoardError(toErrorMessage(refreshError, '저장은 완료되었지만 목록 갱신에 실패했습니다.'));
                }
            }
            setEditingBoardItem(null);
            setIsCreateModalOpen(false);
            return true;
        } catch (error) {
            if (isAnomalyBlockedError(error)) {
                alert('한번에 많은 이상징후가 감지되어 작업을 정지합니다.');
                return false;
            }
            const uploadedPath = uploadedImage?.storagePath ?? '';
            const uploadedTaskPaths = uploadedItemAttachments.map((attachment) => attachment.storagePath).filter(Boolean);
            const rawErrorMessage = error instanceof Error ? error.message : String(error ?? '');
            const isNetworkUncertain = /Failed to fetch|NetworkError|timeout|timed out/i.test(rawErrorMessage);

            if (!hasCommittedBoardItem && uploadedPath) {
                if (!isNetworkUncertain) {
                    void cleanupStoredImagePathSafely(uploadedPath);
                } else {
                    try {
                        const exists = await hasProjectItemByImageStoragePath({
                            projectId: project.id,
                            imageStoragePath: uploadedPath,
                            authorId: user.id,
                        });
                        if (!exists) {
                            void cleanupStoredImagePathSafely(uploadedPath);
                        }
                    } catch {
                        // 상태 판별 불가 시 파일 유지
                    }
                }
            }

            if (!hasCommittedBoardItem && uploadedTaskPaths.length > 0 && !isNetworkUncertain) {
                for (const storagePath of uploadedTaskPaths) {
                    void cleanupStoredImagePathSafely(storagePath);
                }
            }
            alert(toErrorMessage(error, '작성 저장 중 오류가 발생했습니다.'));
            return false;
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDeleteItem = async (taskId: string) => {
        if (!project || !user || isActionSubmitting) {
            return;
        }

        if (!confirm('이 항목을 삭제하시겠습니까?')) {
            return;
        }

        const targetItem = tasks.find((task) => task.id === taskId) ?? posts.find((post) => post.id === taskId);
        const targetStoragePath = targetItem?.imageStoragePath?.trim() || null;
        const targetAttachmentPaths = Array.isArray((targetItem as { attachments?: TaskAttachmentInput[] } | null)?.attachments)
            ? ((targetItem as { attachments: TaskAttachmentInput[] }).attachments)
                .map((attachment) => attachment.storagePath?.trim())
                .filter((path): path is string => Boolean(path))
            : [];

        try {
            setIsActionSubmitting(true);
            await deleteProjectBoardItem(taskId, project.id, { id: user.id, name: displayName, email: viewerEmail });
            if (targetStoragePath) {
                void cleanupStoredImagePathSafely(targetStoragePath);
            }
            if (targetAttachmentPaths.length > 0) {
                for (const storagePath of targetAttachmentPaths) {
                    void cleanupStoredImagePathSafely(storagePath);
                }
            }
            await refreshBoard();
        } catch (error) {
            if (isAnomalyBlockedError(error)) {
                return;
            }
            alert(toErrorMessage(error, '삭제에 실패했습니다.'));
        } finally {
            setIsActionSubmitting(false);
        }
    };

    const handleDeleteFromDetail = (itemId: string) => {
        setBoardDetailState(null);
        void handleDeleteItem(itemId);
    };

    const openTaskEditFromDetail = useCallback((task: Task) => {
        if (!canEditTask(task) || isActionSubmitting || isSubmitting) {
            return;
        }

        setEditingBoardItem({
            id: task.id,
            type: 'TASK',
            title: task.title,
            content: task.content,
            imageUrl: task.imageUrl,
            imageOriginalFilename: task.imageOriginalFilename,
            imageStoredFilename: task.imageStoredFilename,
            imageStoragePath: task.imageStoragePath,
            imageSizeBytes: task.imageSizeBytes,
            attachments: task.attachments.map((attachment) => ({
                fileUrl: attachment.fileUrl,
                originalFilename: attachment.originalFilename,
                storedFilename: attachment.storedFilename,
                storagePath: attachment.storagePath,
                fileSizeBytes: attachment.fileSizeBytes,
                mimeType: attachment.mimeType,
            })),
            status: task.status,
            priority: task.priority,
            assignees: task.assignees.map((assignee) => assignee.id),
            startDate: task.startDate ?? '',
            endDate: task.endDate ?? '',
            category: task.category,
        });
        setBoardDetailState(null);
        setIsCreateModalOpen(true);
    }, [canEditTask, isActionSubmitting, isSubmitting]);

    const openPostEditFromDetail = useCallback((post: ProjectPost) => {
        if (!canEditPost(post) || isActionSubmitting || isSubmitting) {
            return;
        }

        setEditingBoardItem({
            id: post.id,
            type: 'POST',
            title: post.title,
            content: post.content,
            imageUrl: post.imageUrl,
            imageOriginalFilename: post.imageOriginalFilename,
            imageStoredFilename: post.imageStoredFilename,
            imageStoragePath: post.imageStoragePath,
            imageSizeBytes: post.imageSizeBytes,
            attachments: post.attachments.map((attachment) => ({
                fileUrl: attachment.fileUrl,
                originalFilename: attachment.originalFilename,
                storedFilename: attachment.storedFilename,
                storagePath: attachment.storagePath,
                fileSizeBytes: attachment.fileSizeBytes,
                mimeType: attachment.mimeType,
            })),
            category: post.category,
            assignees: post.assignees.map((assignee) => assignee.id),
        });
        setBoardDetailState(null);
        setIsCreateModalOpen(true);
    }, [canEditPost, isActionSubmitting, isSubmitting]);

    const handleQuickUpdateTaskMeta = useCallback(async (next: { status?: TaskStatus; progress?: number }) => {
        if (!project || !user || !selectedTaskForDetail || isDetailTaskMetaSubmitting) {
            return;
        }
        if (!canQuickUpdateTaskMeta(selectedTaskForDetail)) {
            return;
        }

        const status = next.status ?? selectedTaskForDetail.status;
        const progress = typeof next.progress === 'number' ? Math.max(0, Math.min(100, Math.round(next.progress))) : selectedTaskForDetail.progress;

        if (status === selectedTaskForDetail.status && progress === selectedTaskForDetail.progress) {
            return;
        }

        const payload: CreateProjectItemInput = {
            type: 'TASK',
            metaOnly: true,
            title: selectedTaskForDetail.title,
            content: selectedTaskForDetail.content,
            status,
            progress,
            priority: selectedTaskForDetail.priority,
            assignees: selectedTaskForDetail.assignees.map((assignee) => assignee.id),
            startDate: selectedTaskForDetail.startDate ?? '',
            endDate: selectedTaskForDetail.endDate ?? '',
            category: selectedTaskForDetail.category,
            imageUrl: selectedTaskForDetail.imageUrl ?? null,
            imageOriginalFilename: selectedTaskForDetail.imageOriginalFilename ?? null,
            imageStoredFilename: selectedTaskForDetail.imageStoredFilename ?? null,
            imageStoragePath: selectedTaskForDetail.imageStoragePath ?? null,
            imageSizeBytes: selectedTaskForDetail.imageSizeBytes ?? null,
            attachments: selectedTaskForDetail.attachments.map((attachment) => ({
                fileUrl: attachment.fileUrl,
                originalFilename: attachment.originalFilename,
                storedFilename: attachment.storedFilename,
                storagePath: attachment.storagePath,
                fileSizeBytes: attachment.fileSizeBytes,
                mimeType: attachment.mimeType,
            })),
        };

        try {
            setIsDetailTaskMetaSubmitting(true);
            await updateProjectBoardItem(project.id, selectedTaskForDetail.id, payload, {
                id: user.id,
                name: displayName,
                email: viewerEmail,
            });
            await refreshBoard();
        } catch (error) {
            if (isAnomalyBlockedError(error)) {
                return;
            }
            alert(toErrorMessage(error, '업무 상태/진행률을 변경하지 못했습니다.'));
        } finally {
            setIsDetailTaskMetaSubmitting(false);
        }
    }, [
        canQuickUpdateTaskMeta,
        displayName,
        isDetailTaskMetaSubmitting,
        project,
        refreshBoard,
        selectedTaskForDetail,
        user,
        viewerEmail,
    ]);

    const handleToggleProjectFavorite = async () => {
        if (!project || !canToggleFavorite || isFavoriteUpdating) {
            return;
        }

        try {
            setIsFavoriteUpdating(true);
            const next = await updateProjectFavorite(project.id, !project.isFavorite);
            setProject((current) => (current ? { ...current, isFavorite: next.isFavorite } : current));
            await toggleProjectFavorite(project.id, next.isFavorite);
        } catch (error) {
            if (isAnomalyBlockedError(error)) {
                return;
            }
            alert(toErrorMessage(error, '즐겨찾기 상태를 변경하지 못했습니다.'));
        } finally {
            setIsFavoriteUpdating(false);
        }
    };

    const handleInviteMember = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!project || !user || !canManageProject) {
            return;
        }

        if (!inviteForm.name.trim() || !inviteForm.email.trim()) {
            alert('이름과 이메일을 입력해 주세요.');
            return;
        }

        try {
            setIsActionSubmitting(true);
            await createProjectInvitation(
                project.id,
                {
                    inviteeName: inviteForm.name.trim(),
                    inviteeEmail: inviteForm.email.trim().toLowerCase(),
                    inviterId: user.id,
                    inviterName: displayName,
                    role: 'member',
                    message: inviteForm.message.trim() || undefined,
                },
                { userId: user.id, email: viewerEmail, displayName }
            );
            setInviteForm({ name: '', email: '', message: '' });
            await loadProjectMeta(project.id, canManageProject);
            alert('초대 알림이 발송되었습니다.');
        } catch (error) {
            if (isAnomalyBlockedError(error)) {
                return;
            }
            alert(toErrorMessage(error, '초대를 발송하지 못했습니다.'));
        } finally {
            setIsActionSubmitting(false);
        }
    };

    const handleJoinRequest = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!project || !user || isMember || hasPendingMyInvitation) {
            return;
        }

        try {
            setIsActionSubmitting(true);
            await createProjectJoinRequest(
                project.id,
                {
                    requesterName: displayName || user.id,
                    requesterEmail: viewerEmail,
                    requesterId: user.id,
                    message: joinForm.message.trim() || undefined,
                },
                { userId: user.id, email: viewerEmail, displayName }
            );
            setJoinForm({ message: '' });
            await loadProjectMeta(project.id, canManageProject);
            alert('프로젝트 참여 신청이 접수되었습니다.');
        } catch (error) {
            if (isAnomalyBlockedError(error)) {
                return;
            }
            alert(toErrorMessage(error, '참여 신청을 접수하지 못했습니다.'));
        } finally {
            setIsActionSubmitting(false);
        }
    };

    const handleJoinRequestFloating = async () => {
        if (!project || isMember || isActionSubmitting) {
            return;
        }

        if (!isAuthenticated || !user) {
            router.push('/login');
            return;
        }

        const shouldRequest = window.confirm('해당 프로젝트에 참여 신청 하시겠습니까?');
        if (!shouldRequest) {
            return;
        }

        try {
            setIsActionSubmitting(true);
            await createProjectJoinRequest(
                project.id,
                {
                    requesterName: displayName || user.email || '사용자',
                    requesterEmail: viewerEmail,
                    requesterId: user.id,
                },
                { userId: user.id, email: viewerEmail, displayName }
            );
            await loadProjectMeta(project.id, canManageProject);
            alert('프로젝트 참여 신청이 접수되었습니다.');
        } catch (error) {
            if (isAnomalyBlockedError(error)) {
                return;
            }
            alert(toErrorMessage(error, '프로젝트 참여 신청을 접수하지 못했습니다.'));
        } finally {
            setIsActionSubmitting(false);
        }
    };

    const handleInvitationDecision = async (invitationId: string, decision: 'ACCEPTED' | 'DECLINED') => {
        if (!user) return;

        try {
            setIsActionSubmitting(true);
            await respondProjectInvitation(invitationId, decision, {
                userId: user.id,
                email: viewerEmail,
                displayName,
            });
            await loadProjectMeta(project?.id ?? id, canManageProject);
            if (decision === 'ACCEPTED') {
                await refreshBoard();
            } else {
                await refreshAccess();
            }
        } catch (error) {
            if (isAnomalyBlockedError(error)) {
                return;
            }
            alert(toErrorMessage(error, '초대 처리에 실패했습니다.'));
        } finally {
            setIsActionSubmitting(false);
        }
    };

    const handleJoinRequestReview = async (requestId: string, decision: 'APPROVED' | 'REJECTED') => {
        if (!user || !canManageProject) {
            return;
        }

        try {
            setIsActionSubmitting(true);
            await reviewJoinRequest(requestId, decision, {
                userId: user.id,
                email: viewerEmail,
                displayName,
            });
            await loadProjectMeta(project?.id ?? id, canManageProject);
            await refreshBoard();
        } catch (error) {
            if (isAnomalyBlockedError(error)) {
                return;
            }
            alert(toErrorMessage(error, '신청 처리에 실패했습니다.'));
        } finally {
            setIsActionSubmitting(false);
        }
    };

    const handleTransferLeader = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!project || !user || !canManageProject || !transferMemberId) {
            return;
        }

        const target = memberOptions.find((member) => member.id === transferMemberId);
        if (!target) {
            alert('위임할 멤버를 선택해 주세요.');
            return;
        }

        const confirmMessage = `${target.name}님에게 팀장 권한을 위임할까요?`;
        if (!confirm(confirmMessage)) {
            return;
        }

        try {
            setIsActionSubmitting(true);
            await transferProjectLeader(project.id, transferMemberId, {
                userId: user.id,
                displayName,
            });
            await refreshAccess();
            await refreshBoard();
            setTransferMemberId('');
            alert('팀장 권한을 위임했습니다.');
        } catch (error) {
            if (isAnomalyBlockedError(error)) {
                return;
            }
            alert(toErrorMessage(error, '팀장 위임 처리에 실패했습니다.'));
        } finally {
            setIsActionSubmitting(false);
        }
    };

    const handleLeaveProject = async () => {
        if (!project || !user || isLeavingProject) {
            return;
        }

        if (!isMember) {
            alert('프로젝트 멤버만 프로젝트에서 나갈 수 있습니다.');
            return;
        }

        if (isLeader) {
            alert('팀장은 프로젝트에서 나갈 수 없습니다. 다른 팀원에게 위임 해 주세요.');
            return;
        }

        setShowLeaveConfirm(true);
    };

    const confirmLeaveProject = async () => {
        if (!project || !user || isLeavingProject) {
            return;
        }

        try {
            setIsLeavingProject(true);
            setShowLeaveConfirm(false);
            await leaveProject(project.id);
            await refreshProjects();
            alert('프로젝트에서 나갔습니다.');
            router.replace('/dashboard');
        } catch (error) {
            if (isAnomalyBlockedError(error)) {
                return;
            }
            alert(toErrorMessage(error, '프로젝트 나가기에 실패했습니다.'));
        } finally {
            setIsLeavingProject(false);
        }
    };

    const handleProjectTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        const nativeEvent = e.nativeEvent as KeyboardEvent & { isComposing?: boolean };

        if (nativeEvent.isComposing || isTagComposing) {
            return;
        }

        if (e.key !== 'Enter') {
            return;
        }

        e.preventDefault();
        const nextTag = projectTagInput.trim();
        if (!nextTag) {
            return;
        }

        if (projectForm.tags.includes(nextTag)) {
            alert('이미 추가된 태그입니다.');
            return;
        }

        setProjectForm((prev) => ({ ...prev, tags: [...prev.tags, nextTag] }));
        setProjectTagInput('');
    };

    const handleProjectTagRemove = (tagToRemove: string) => {
        setProjectForm((prev) => ({ ...prev, tags: prev.tags.filter((tag) => tag !== tagToRemove) }));
    };

    const handleSubmitBoardComment = useCallback(async (input: {
        itemId: string;
        body: string;
        parentCommentId?: string | null;
    }) => {
        if (!project || !user) {
            alert('로그인 후 댓글을 작성해 주세요.');
            return;
        }

        if (!canCreateBoard) {
            alert('프로젝트 멤버만 댓글을 작성할 수 있습니다.');
            return;
        }

        try {
            const saved = await createProjectItemComment({
                projectId: project.id,
                itemId: input.itemId,
                body: input.body,
                parentCommentId: input.parentCommentId ?? null,
                author: {
                    id: user.id,
                    name: displayName,
                },
            });
            appendCommentToBoardState(saved);
        } catch (error) {
            if (isAnomalyBlockedError(error)) {
                return;
            }
            alert(toErrorMessage(error, '댓글을 등록하지 못했습니다.'));
        }
    }, [appendCommentToBoardState, canCreateBoard, displayName, project, user]);

    const handleUpdateProject = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!project || !user || !canManageProject) {
            return;
        }

        const nextName = projectForm.name.trim();
        const nextDescription = projectForm.description.trim();
        const nextCategory = projectForm.category.trim() || '미분류';
        const nextThemeColor = projectForm.themeColor.trim();

        if (!nextName) {
            alert('프로젝트 이름은 필수입니다.');
            return;
        }

        if (!nextDescription) {
            alert('프로젝트 설명은 필수입니다.');
            return;
        }

        if (!nextThemeColor || !/^#(?:[0-9a-fA-F]{3}){1,2}$/.test(nextThemeColor)) {
            alert('컬러 코드는 #000000 형식이어야 합니다.');
            return;
        }

        if (projectForm.startDate && projectForm.endDate && projectForm.startDate > projectForm.endDate) {
            alert('종료일은 시작일보다 빠를 수 없습니다.');
            return;
        }

        try {
            setIsProjectSubmitting(true);
            const updated = await updateProject(
                project.id,
                {
                    name: nextName,
                    description: nextDescription,
                    category: nextCategory,
                    themeColor: nextThemeColor,
                    status: projectForm.status,
                    visibility: projectForm.visibility,
                    tags: projectForm.tags,
                    startDate: projectForm.startDate,
                    endDate: projectForm.endDate,
                },
                { userId: user.id, email: viewerEmail }
            );

            setProject(updated);
            syncProjectForm(updated);
            await refreshProjects();
            await refreshBoard();
            setIsProjectFormOpen(false);
        } catch (error) {
            if (isAnomalyBlockedError(error)) {
                return;
            }
            alert(toErrorMessage(error, '프로젝트 수정에 실패했습니다.'));
        } finally {
            setIsProjectSubmitting(false);
        }
    };

    const handleDeleteProject = async () => {
        if (!project || !user || (!isProjectAdmin && !isLeader) || isDeletingProject) {
            return;
        }

        setDeleteConfirmInput('');
        setShowDeleteConfirm(true);
    };

    const confirmDeleteProject = async () => {
        if (!project || !user || isDeletingProject) {
            return;
        }

        if (deleteConfirmInput.trim() !== '삭제하기') {
            return;
        }

        try {
            setIsDeletingProject(true);
            setShowDeleteConfirm(false);
            await deleteProject(project.id, { userId: user.id, email: viewerEmail });
            await refreshProjects();
            router.replace('/dashboard');
        } catch (error) {
            if (isAnomalyBlockedError(error)) {
                return;
            }
            alert(toErrorMessage(error, '프로젝트 삭제에 실패했습니다.'));
        } finally {
            setIsDeletingProject(false);
        }
    };

    const openProjectForm = () => {
        syncProjectForm(project);
        setIsProjectFormOpen(true);
    };

    if (isProjectLoading) {
        return (
            <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8 min-h-screen flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
        );
    }

    if (!project) {
        if (projectError) {
            return (
                <div className="max-w-7xl mx-auto py-16 px-4 sm:px-6 lg:px-8">
                    <div className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-600">
                        {toErrorText(projectError)}
                    </div>
                </div>
            );
        }

        return notFound();
    }

    return (
        <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8 min-h-screen pb-20">
            <ProjectHeader
                project={project}
                onToggleFavorite={canToggleFavorite ? handleToggleProjectFavorite : undefined}
                isFavoriteUpdating={isFavoriteUpdating}
            />

            <div className="mb-7">
                <SectionTitle title="프로젝트 진행사항" />
                <TabSwiper
                    tabs={STATUS_TABS}
                    activeTabId={project.status ?? 'REQUEST'}
                    onTabClick={async (tabId) => {
                        if (!canManageProject || isChangingProjectStatus) return;
                        if (tabId === (project.status ?? 'REQUEST')) return;
                        try {
                            setIsChangingProjectStatus(true);
                            const updated = await updateProject(
                                project.id,
                                { status: tabId as TaskStatus },
                                { userId: user!.id, email: viewerEmail }
                            );
                            setProject(updated);
                            await refreshProjects();
                        } catch (error) {
                            if (!isAnomalyBlockedError(error)) {
                                alert(toErrorMessage(error, '프로젝트 상태 변경에 실패했습니다.'));
                            }
                        } finally {
                            setIsChangingProjectStatus(false);
                        }
                    }}
                    themeColor={project.themeColor}
                    variant="STATUS"
                    colorMap={STATUS_COLORS}
                    className="pb-1"
                />
                {!canManageProject && (
                    <p className="text-xs text-gray-400 mt-1 ml-1">프로젝트 상태 변경은 팀장만 가능합니다.</p>
                )}
            </div>

            <div className="bg-white">
                <div className="overflow-x-auto">
                    <div className="flex">
                        {BOARD_TABS.map((tab) => (
                            <ThinTab
                                key={tab.id}
                                isActive={activeBoardTab === tab.id}
                                color={project.themeColor}
                                onClick={() => setActiveBoardTab(tab.id as BoardTabType)}
                            >
                                {tab.label}
                            </ThinTab>
                        ))}
                    </div>
                </div>

                <TabSwiper
                    tabs={categoryTabs}
                    activeTabId={activeCategoryTab}
                    onTabClick={setActiveCategoryTab}
                    themeColor={project.themeColor}
                    variant="CATEGORY"
                    className="py-2"
                />

                {activeBoardTab === 'TASK' && (
                    <div className="pb-2">
                        <select
                            value={taskStatusFilter}
                            onChange={(e) => setTaskStatusFilter(e.target.value)}
                            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-[#B95D69] cursor-pointer"
                        >
                            <option value="ALL">전체 상태</option>
                            {STATUS_TABS.map((tab) => (
                                <option key={tab.id} value={tab.id}>{tab.label}</option>
                            ))}
                        </select>
                    </div>
                )}
            </div>

            {showProjectManagementPanels && canManageProject && (
                <section className="mt-6 rounded-xl border border-gray-100 bg-white p-4 space-y-4">
                    <SectionTitle
                        title="프로젝트 설정"
                        rightSlot={
                            <button
                                type="button"
                                onClick={() => {
                                    if (isProjectFormOpen) {
                                        setIsProjectFormOpen(false);
                                        resetProjectEditForm();
                                    } else {
                                        openProjectForm();
                                    }
                                }}
                                className="text-xs px-2 py-1 rounded-md border border-gray-200 hover:bg-gray-50 flex items-center gap-1"
                            >
                                <Pencil className="w-3.5 h-3.5" />
                                {isProjectFormOpen ? '취소' : '수정'}
                            </button>
                        }
                    />

                    {!isProjectFormOpen ? (
                        <div className="space-y-2 text-sm text-gray-600">
                            <div>
                                <span className="text-gray-400">이름</span>
                                <p className="text-gray-900 font-medium">{project.name}</p>
                            </div>
                            <div>
                                <span className="text-gray-400">요약</span>
                                <p className="text-gray-700 leading-relaxed">
                                    {project.description || '설명이 비어 있습니다.'}
                                </p>
                            </div>
                            <div>
                                <span className="text-gray-400">공개 범위</span>
                                <p className="text-gray-900">{project.visibility === 'public' ? '전체 공개' : '초대 멤버만'}</p>
                            </div>
                            <div>
                                <span className="text-gray-400">진행상태</span>
                                <p className="text-gray-900">
                                    {STATUS_TABS.find((tab) => tab.id === (project.status ?? 'REQUEST'))?.label ?? '요청'}
                                </p>
                            </div>
                        </div>
                    ) : (
                        <form onSubmit={handleUpdateProject} className="space-y-4">
                            <div>
                                <label className="block text-xs text-gray-500 mb-1">프로젝트명</label>
                                <input
                                    type="text"
                                    value={projectForm.name}
                                    onChange={(e) => setProjectForm((prev) => ({ ...prev, name: e.target.value }))}
                                    className="w-full h-10 px-3 border border-gray-200 rounded-lg text-sm text-gray-900"
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-gray-500 mb-1">요약</label>
                                <textarea
                                    value={projectForm.description}
                                    onChange={(e) => setProjectForm((prev) => ({ ...prev, description: e.target.value }))}
                                    className="w-full min-h-24 border border-gray-200 rounded-lg p-3 text-sm text-gray-900"
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-gray-500 mb-1">말머리</label>
                                <input
                                    type="text"
                                    value={projectForm.category}
                                    onChange={(e) => setProjectForm((prev) => ({ ...prev, category: e.target.value }))}
                                    className="w-full h-10 px-3 border border-gray-200 rounded-lg text-sm text-gray-900"
                                />
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs text-gray-500 mb-1">시작일</label>
                                    <input
                                        type="date"
                                        value={projectForm.startDate}
                                        onChange={(e) => setProjectForm((prev) => ({ ...prev, startDate: e.target.value }))}
                                        className="w-full h-10 px-3 border border-gray-200 rounded-lg text-sm text-gray-900"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-500 mb-1">종료일</label>
                                    <input
                                        type="date"
                                        value={projectForm.endDate}
                                        onChange={(e) => setProjectForm((prev) => ({ ...prev, endDate: e.target.value }))}
                                        className="w-full h-10 px-3 border border-gray-200 rounded-lg text-sm text-gray-900"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs text-gray-500 mb-1">프로젝트 진행상태</label>
                                <select
                                    value={projectForm.status}
                                    onChange={(e) => setProjectForm((prev) => ({ ...prev, status: e.target.value as TaskStatus }))}
                                    className="w-full h-10 px-3 border border-gray-200 rounded-lg text-sm text-gray-900"
                                >
                                    {STATUS_TABS.map((tab) => (
                                        <option key={tab.id} value={tab.id}>
                                            {tab.label}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs text-gray-500 mb-1">테마 색상</label>
                                <div className="flex gap-2 flex-wrap">
                                    {THEME_COLORS.map((color) => (
                                        <button
                                            type="button"
                                            key={color}
                                            onClick={() => setProjectForm((prev) => ({ ...prev, themeColor: color }))}
                                            className={clsx(
                                                'w-8 h-8 rounded-full border-2',
                                                projectForm.themeColor === color ? 'border-gray-900' : 'border-transparent'
                                            )}
                                            style={{ backgroundColor: color }}
                                            title={color}
                                        />
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs text-gray-500 mb-1">태그</label>
                                <input
                                    type="text"
                                    value={projectTagInput}
                                    onChange={(e) => setProjectTagInput(e.target.value)}
                                    onCompositionStart={() => setIsTagComposing(true)}
                                    onCompositionEnd={() => setIsTagComposing(false)}
                                    onKeyDown={handleProjectTagKeyDown}
                                    className="w-full h-10 px-3 border border-gray-200 rounded-lg text-sm text-gray-900"
                                    placeholder="태그 입력 후 Enter"
                                />
                                <div className="mt-2 flex flex-wrap gap-2">
                                    {projectForm.tags.length === 0 && (
                                        <span className="text-xs text-gray-400">태그가 없습니다.</span>
                                    )}
                                    {projectForm.tags.map((tag, index) => (
                                        <span
                                            key={`${tag}-${index}`}
                                            className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs text-white"
                                            style={{ backgroundColor: projectForm.themeColor }}
                                        >
                                            {tag}
                                            <button
                                                type="button"
                                                onClick={() => handleProjectTagRemove(tag)}
                                                className="hover:opacity-80"
                                                aria-label={`${tag} 삭제`}
                                            >
                                                <X className="w-3 h-3" />
                                            </button>
                                        </span>
                                    ))}
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <label className="flex items-center gap-2 text-sm text-gray-700">
                                    <input
                                        type="radio"
                                        checked={projectForm.visibility === 'public'}
                                        onChange={() => setProjectForm((prev) => ({ ...prev, visibility: 'public' }))}
                                    />
                                    전체 공개
                                </label>
                                <label className="flex items-center gap-2 text-sm text-gray-700">
                                    <input
                                        type="radio"
                                        checked={projectForm.visibility === 'private'}
                                        onChange={() => setProjectForm((prev) => ({ ...prev, visibility: 'private' }))}
                                    />
                                    비공개
                                </label>
                            </div>

                            <button
                                type="submit"
                                disabled={isProjectSubmitting}
                                className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-semibold disabled:opacity-60"
                            >
                                {isProjectSubmitting ? '수정 중...' : '변경 저장'}
                            </button>
                        </form>
                    )}

                    {isProjectAdmin && (
                        <div className="pt-2 border-t border-gray-100">
                            <button
                                type="button"
                                onClick={handleDeleteProject}
                                disabled={isDeletingProject}
                                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-red-200 text-red-500 text-sm font-semibold hover:bg-red-50 disabled:opacity-60"
                            >
                                <Trash2 className="w-3.5 h-3.5" />
                                {isDeletingProject ? '삭제 중...' : '프로젝트 삭제'}
                            </button>
                        </div>
                    )}
                </section>
            )}

            {showProjectManagementPanels && canManageProject && (
                <section className="mt-6 rounded-xl border border-gray-100 bg-white p-4 space-y-5">
                    <SectionTitle
                        title="멤버 관리"
                        rightSlot={
                            <span className="text-xs inline-flex items-center px-2 py-1 rounded-full bg-gray-100 text-gray-500">
                                팀원 {memberOptions.length}명
                            </span>
                        }
                    />
                    <form onSubmit={handleInviteMember} className="space-y-2">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            <input
                                type="text"
                                value={inviteForm.name}
                                onChange={(e) => setInviteForm((prev) => ({ ...prev, name: e.target.value }))}
                                className="h-10 border border-gray-200 rounded-lg px-3 text-sm text-gray-900"
                                placeholder="이름"
                            />
                            <input
                                type="email"
                                value={inviteForm.email}
                                onChange={(e) => setInviteForm((prev) => ({ ...prev, email: e.target.value }))}
                                className="h-10 border border-gray-200 rounded-lg px-3 text-sm text-gray-900"
                                placeholder="이메일"
                            />
                        </div>
                        <textarea
                            value={inviteForm.message}
                            onChange={(e) => setInviteForm((prev) => ({ ...prev, message: e.target.value }))}
                            className="w-full min-h-[72px] border border-gray-200 rounded-lg p-3 text-sm text-gray-900"
                            placeholder="초대 메시지(선택)"
                        />
                        <div className="flex justify-end">
                            <button
                                type="submit"
                                disabled={isActionSubmitting}
                                className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-semibold disabled:opacity-60"
                            >
                                초대 발송
                            </button>
                        </div>
                    </form>

                    {(invitations.length > 0 || joinRequests.length > 0) && (
                        <div className="pt-1 space-y-3">
                            {invitations.length > 0 && (
                                <div>
                                    <h4 className="text-xs font-semibold text-gray-500 mb-2 flex items-center">
                                        <UserCheck className="w-4 h-4 mr-1" />
                                        초대 상태
                                    </h4>
                                    <div className="space-y-2">
                                        {invitations
                                            .filter((invitation) => invitation.status === 'PENDING')
                                            .map((invitation) => (
                                                <div key={invitation.id} className="text-sm flex items-center justify-between border rounded-lg px-3 py-2">
                                                    <div>
                                                        <div className="font-semibold text-gray-800">{invitation.inviteeName}</div>
                                                        <div className="text-xs text-gray-400">{invitation.inviteeEmail}</div>
                                                    </div>
                                                    <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600">{invitation.status}</span>
                                                </div>
                                            ))}
                                    </div>
                                </div>
                            )}

                            {joinRequests.length > 0 && (
                                <div>
                                    <h4 className="text-xs font-semibold text-gray-500 mb-2 flex items-center">
                                        <Users className="w-4 h-4 mr-1" />
                                        참여 신청
                                    </h4>
                                    <div className="space-y-2">
                                        {joinRequests.map((request) => (
                                            <div key={request.id} className="text-sm border rounded-lg px-3 py-2 space-y-1">
                                                <div className="font-semibold text-gray-800">{request.requesterName}</div>
                                                <div className="text-xs text-gray-500">요청 메모: {request.message || '-'}</div>
                                                <div className="flex gap-2 pt-1">
                                                    <button
                                                        type="button"
                                                        onClick={() => handleJoinRequestReview(request.id, 'APPROVED')}
                                                        className="px-2 py-1 text-xs rounded-md border border-gray-200 hover:bg-gray-50"
                                                    >
                                                        승인
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleJoinRequestReview(request.id, 'REJECTED')}
                                                        className="px-2 py-1 text-xs rounded-md border border-gray-200 hover:bg-gray-50"
                                                    >
                                                        거절
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {memberOptions.length > 0 && (
                        <form onSubmit={handleTransferLeader} className="pt-1 space-y-2">
                            <h4 className="text-xs font-semibold text-gray-500 flex items-center">
                                <ShieldCheck className="w-4 h-4 mr-1" />
                                팀장 위임
                            </h4>
                            <div className="flex flex-col sm:flex-row gap-2">
                                <select
                                    value={transferMemberId}
                                    onChange={(e) => setTransferMemberId(e.target.value)}
                                    className="flex-1 border border-gray-200 h-11 px-3 rounded-lg text-sm text-gray-900"
                                >
                                    <option value="">팀원 선택</option>
                                    {transferCandidateMembers.map((member) => (
                                        <option key={member.id} value={member.id}>
                                            {member.name}
                                        </option>
                                    ))}
                                </select>
                                <button
                                    type="submit"
                                    disabled={isActionSubmitting || !transferMemberId}
                                    className="px-4 py-2 h-11 rounded-lg bg-gray-900 text-white font-semibold text-sm disabled:opacity-60"
                                >
                                    위임하기
                                </button>
                            </div>
                        </form>
                    )}
                </section>
            )}

            {showProjectManagementPanels && !isMember && isAuthenticated && !hasPendingMyInvitation && (
                <section className="mt-6 rounded-xl border border-gray-100 bg-white p-4">
                    <SectionTitle title="프로젝트 참여 신청" />
                    <form onSubmit={handleJoinRequest} className="space-y-2">
                        <textarea
                            value={joinForm.message}
                            onChange={(e) => setJoinForm({ message: e.target.value })}
                            className="w-full min-h-[72px] border border-gray-200 rounded-lg p-3 text-sm text-gray-900"
                            placeholder="참여 사유를 간단히 적어주세요."
                        />
                        <div className="flex justify-end">
                            <button
                                type="submit"
                                disabled={isActionSubmitting}
                                className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-semibold disabled:opacity-60"
                            >
                                신청하기
                            </button>
                        </div>
                    </form>
                </section>
            )}

            {showProjectManagementPanels && !isMember && !isAuthenticated && (
                <section className="mt-6 rounded-xl border border-gray-100 bg-white p-4 text-sm text-gray-500">
                    이 프로젝트의 업무/글 및 참여 신청은 로그인 후 가능합니다.
                </section>
            )}

            {showProjectManagementPanels && myPendingInvitation && (
                <section className="mt-6 rounded-xl border border-gray-100 bg-white p-4">
                    <SectionTitle title="내 초대" />
                    <div className="rounded-lg border border-gray-200 p-2.5 flex items-center justify-between">
                        <div className="text-sm">
                            <div className="font-semibold text-gray-800">
                                {myPendingInvitation.inviteeName}
                            </div>
                            <div className="text-xs text-gray-500">상태: {myPendingInvitation.status}</div>
                        </div>
                        {myPendingInvitation.status === 'PENDING' && (
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={() => handleInvitationDecision(myPendingInvitation.id, 'ACCEPTED')}
                                    className="px-3 py-1.5 rounded-md text-xs border border-gray-200"
                                >
                                    수락
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleInvitationDecision(myPendingInvitation.id, 'DECLINED')}
                                    className="px-3 py-1.5 rounded-md text-xs border border-gray-200"
                                >
                                    거절
                                </button>
                            </div>
                        )}
                    </div>
                </section>
            )}

            {boardHasError && (
                <div className="mb-4 mt-6 flex items-center justify-between gap-2 rounded-xl border border-red-100 bg-red-50 px-4 py-3">
                    <div className="flex items-center gap-2 text-sm text-red-500">
                        <AlertCircle className="w-4 h-4" />
                        <span>{toErrorText(boardError)}</span>
                    </div>
                    <button
                        type="button"
                        onClick={handleRetry}
                        className="px-3 py-1.5 rounded-lg bg-white border border-red-200 text-xs text-red-500 hover:bg-red-50"
                    >
                        다시 시도
                    </button>
                </div>
            )}

            {activeBoardTab === 'TASK' && (
                <section className="mt-6 space-y-4">
                    {isBoardLoading && (
                        <div className="flex items-center justify-center py-8">
                            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                        </div>
                    )}
                    {!isBoardLoading && filteredTasks.length === 0 && !boardHasError && (
                        <div className="text-sm text-gray-400 bg-white border border-dashed border-gray-200 rounded-xl px-4 py-6 text-center">
                            {taskEmptyMessage}
                        </div>
                    )}
                    {!isBoardLoading && filteredTasks.map((task) => (
                        <div key={task.id} className="space-y-3">
                            <TaskCard
                                task={task}
                                themeColor={project.themeColor}
                                onDetail={() => openBoardDetail('TASK', task.id)}
                            />
                        </div>
                    ))}
                </section>
            )}

            {activeBoardTab === 'POST' && (
                <section className="mt-6 space-y-4">
                    {isBoardLoading && (
                        <div className="flex items-center justify-center py-4">
                            <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                        </div>
                    )}
                    {!isBoardLoading && filteredPosts.length === 0 && !boardHasError && (
                        <div className="text-sm text-gray-400 bg-white border border-dashed border-gray-200 rounded-xl px-4 py-6 text-center">
                            {postEmptyMessage}
                        </div>
                    )}
                    {!isBoardLoading && filteredPosts.map((post) => (
                        <div key={post.id} className="space-y-3">
                            <div
                                className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm space-y-2"
                            >
                                <div className="flex justify-between items-start gap-2">
                                    <h3 className="text-base font-bold text-gray-900">{post.title}</h3>
                                    <span className="text-xs text-gray-400 whitespace-nowrap">{post.createdAt}</span>
                                </div>
                                <p className="text-sm text-gray-600 leading-relaxed">{post.content}</p>
                                {post.imageUrl && (
                                    <a
                                        href={post.imageUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="block overflow-hidden rounded-lg border border-gray-200"
                                    >
                                        <img
                                            src={post.imageUrl}
                                            alt={post.imageOriginalFilename || '글 첨부 이미지'}
                                            className="max-h-80 w-full object-cover"
                                        />
                                    </a>
                                )}
                                <div className="flex items-center justify-between text-xs text-gray-400">
                                    <span>{post.author}</span>
                                    <span>{post.commentCount} 댓글</span>
                                </div>
                                <div className="pt-1 flex justify-end gap-2">
                                    <button
                                        type="button"
                                        onClick={() => openBoardDetail('POST', post.id)}
                                        className="text-xs text-gray-500 border border-gray-200 rounded-md px-2 py-1 hover:bg-gray-50 cursor-pointer"
                                    >
                                        상세 보기
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </section>
            )}

            {isAuthenticated && isMember && (
                <button
                    type="button"
                    onClick={() => void handleLeaveProject()}
                    disabled={isLeavingProject}
                    className={clsx(
                        'fixed bottom-6 h-12 px-4 rounded-full border text-sm font-semibold shadow-lg z-50 transition-colors cursor-pointer',
                        canManageProject ? 'right-[10.5rem]' : 'right-24',
                        isLeavingProject
                            ? 'border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed'
                            : 'bg-white hover:bg-opacity-10'
                    )}
                    style={isLeavingProject ? undefined : {
                        borderColor: `${project.themeColor}55`,
                        color: project.themeColor,
                    }}
                >
                    {isLeavingProject ? '처리 중...' : '프로젝트 나가기'}
                </button>
            )}

            {canManageProject && (
                <button
                    onClick={openProjectSettingsModal}
                    disabled={isProjectSettingsSubmitting}
                    className={clsx(
                        'fixed bottom-6 right-24 w-14 h-14 text-white rounded-full shadow-2xl flex items-center justify-center transition-transform hover:scale-105 active:scale-95 z-50',
                        isProjectSettingsSubmitting ? 'bg-gray-300 cursor-not-allowed' : 'cursor-pointer'
                    )}
                    style={isProjectSettingsSubmitting ? undefined : {
                        backgroundColor: project.themeColor,
                    }}
                    title="프로젝트 설정 수정"
                >
                    <Pencil className="w-6 h-6" />
                </button>
            )}

            {canCreateBoard ? (
                <button
                    onClick={openCreateBoardItem}
                    className="fixed bottom-6 right-6 w-14 h-14 text-white rounded-full shadow-2xl flex items-center justify-center transition-transform hover:scale-105 active:scale-95 z-50 bg-gray-900 hover:bg-gray-800 cursor-pointer"
                    title="새 글/업무 작성"
                >
                    <PenTool className="w-6 h-6" />
                </button>
            ) : (
                <button
                    type="button"
                    onClick={() => void handleJoinRequestFloating()}
                    disabled={isActionSubmitting}
                    className={clsx(
                        'fixed bottom-6 right-6 w-14 h-14 text-white rounded-full shadow-2xl flex items-center justify-center transition-transform z-50 cursor-pointer',
                        isActionSubmitting ? 'bg-gray-300 cursor-not-allowed' : 'bg-[#B95D69] hover:bg-[#A64D5A] hover:scale-105 active:scale-95'
                    )}
                    title="프로젝트 참여 신청"
                >
                    <Plus className="w-6 h-6" />
                </button>
            )}

            {boardDetailState && (
                <div className="fixed inset-0 z-[58] flex items-center justify-center p-4 sm:p-6">
                    <button
                        type="button"
                        className="fixed inset-0 bg-black/45 backdrop-blur-[1px] cursor-pointer"
                        onClick={closeBoardDetail}
                        aria-label="상세 닫기"
                    />
                    <div className="relative z-10 w-full max-w-3xl max-h-[90vh] overflow-hidden rounded-xl bg-white shadow-2xl">
                        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
                            <h2 className="text-lg font-bold text-gray-900">
                                {boardDetailState.type === 'TASK' ? '업무 상세' : '글 상세'}
                            </h2>
                            <button
                                type="button"
                                onClick={closeBoardDetail}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 cursor-pointer"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                        <div className="max-h-[calc(90vh-60px)] overflow-y-auto p-5 space-y-4">
                            {!selectedDetailItem ? (
                                <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
                                    선택한 항목을 찾을 수 없습니다.
                                </div>
                            ) : (
                                <>
                                    {selectedTaskForDetail ? (
                                        <article className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
                                            <div className="flex items-start justify-between gap-3">
                                                <h3 className="text-base font-semibold text-gray-900">{selectedTaskForDetail.title}</h3>
                                                <span className="whitespace-nowrap text-xs text-gray-500">{selectedTaskForDetail.createdAt}</span>
                                            </div>
                                            <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                                                <span className="rounded-full border border-gray-200 px-2 py-0.5">{getTaskStatusLabel(selectedTaskForDetail.status)}</span>
                                                <span className="rounded-full border border-gray-200 px-2 py-0.5">{getTaskPriorityLabel(selectedTaskForDetail.priority)}</span>
                                                {selectedTaskForDetail.category && (
                                                    <span className="rounded-full border border-gray-200 px-2 py-0.5">{selectedTaskForDetail.category}</span>
                                                )}
                                            </div>
                                            <div className="space-y-2 rounded-lg border border-gray-100 bg-gray-50/60 p-3">
                                                <div>
                                                    <p className="mb-1 text-[11px] font-semibold text-gray-500">진행 상태</p>
                                                    <TabSwiper
                                                        tabs={STATUS_TABS}
                                                        activeTabId={selectedTaskForDetail.status}
                                                        onTabClick={(nextStatus) => {
                                                            void handleQuickUpdateTaskMeta({ status: nextStatus as TaskStatus });
                                                        }}
                                                        themeColor={project.themeColor}
                                                        variant="STATUS"
                                                        colorMap={STATUS_COLORS}
                                                        className="pb-1"
                                                    />
                                                </div>
                                                <div>
                                                    <p className="mb-1 text-[11px] font-semibold text-gray-500">업무 진행률</p>
                                                    <TabSwiper
                                                        tabs={detailTaskProgressTabs}
                                                        activeTabId={String(Math.max(0, Math.min(100, Math.round(selectedTaskForDetail.progress))))}
                                                        onTabClick={(nextProgress) => {
                                                            void handleQuickUpdateTaskMeta({ progress: Number(nextProgress) });
                                                        }}
                                                        themeColor={project.themeColor}
                                                        variant="STATUS"
                                                        className="pb-1"
                                                    />
                                                </div>
                                                {isDetailTaskMetaSubmitting && (
                                                    <p className="text-[11px] text-gray-500">변경 사항을 저장하는 중입니다.</p>
                                                )}
                                            </div>
                                            <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700">{selectedTaskForDetail.content}</p>
                                            {selectedTaskForDetail.imageUrl && (
                                                <a
                                                    href={selectedTaskForDetail.imageUrl}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="block overflow-hidden rounded-lg border border-gray-200"
                                                >
                                                    <img
                                                        src={selectedTaskForDetail.imageUrl}
                                                        alt={selectedTaskForDetail.imageOriginalFilename || '업무 첨부 이미지'}
                                                        className="max-h-80 w-full object-cover"
                                                    />
                                                </a>
                                            )}
                                            {selectedTaskForDetail.attachments.length > 0 && (
                                                <div className="space-y-2">
                                                    <p className="text-xs font-semibold text-gray-600">첨부 파일</p>
                                                    <ul className="space-y-1.5">
                                                        {selectedTaskForDetail.attachments.map((attachment) => (
                                                            <li key={attachment.id || attachment.storagePath}>
                                                                <a
                                                                    href={attachment.fileUrl}
                                                                    target="_blank"
                                                                    rel="noreferrer"
                                                                    className="text-sm text-gray-700 underline-offset-2 hover:underline"
                                                                >
                                                                    {attachment.originalFilename}
                                                                </a>
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            )}
                                            {(canEditTask(selectedTaskForDetail) || canDeleteTask(selectedTaskForDetail)) && (
                                                <div className="flex justify-end gap-2 pt-2">
                                                    {canEditTask(selectedTaskForDetail) && (
                                                        <button
                                                            type="button"
                                                            onClick={() => openTaskEditFromDetail(selectedTaskForDetail)}
                                                            disabled={isSubmitting || isActionSubmitting || isDetailTaskMetaSubmitting}
                                                            className="rounded-md border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-60 cursor-pointer"
                                                        >
                                                            수정
                                                        </button>
                                                    )}
                                                    {canDeleteTask(selectedTaskForDetail) && (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleDeleteFromDetail(selectedTaskForDetail.id)}
                                                            disabled={isActionSubmitting || isDetailTaskMetaSubmitting}
                                                            className="rounded-md border border-red-100 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 disabled:opacity-60 cursor-pointer"
                                                        >
                                                            삭제
                                                        </button>
                                                    )}
                                                </div>
                                            )}
                                        </article>
                                    ) : selectedPostForDetail ? (
                                        <article className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
                                            <div className="flex items-start justify-between gap-3">
                                                <h3 className="text-base font-semibold text-gray-900">{selectedPostForDetail.title}</h3>
                                                <span className="whitespace-nowrap text-xs text-gray-500">{selectedPostForDetail.createdAt}</span>
                                            </div>
                                            <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                                                <span className="rounded-full border border-gray-200 px-2 py-0.5">{selectedPostForDetail.category}</span>
                                                <span>{selectedPostForDetail.author}</span>
                                            </div>
                                            <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700">{selectedPostForDetail.content}</p>
                                            {selectedPostForDetail.imageUrl && (
                                                <a
                                                    href={selectedPostForDetail.imageUrl}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="block overflow-hidden rounded-lg border border-gray-200"
                                                >
                                                    <img
                                                        src={selectedPostForDetail.imageUrl}
                                                        alt={selectedPostForDetail.imageOriginalFilename || '글 첨부 이미지'}
                                                        className="max-h-80 w-full object-cover"
                                                    />
                                                </a>
                                            )}
                                            {selectedPostForDetail.attachments.length > 0 && (
                                                <div className="space-y-2">
                                                    <p className="text-xs font-semibold text-gray-600">첨부 파일</p>
                                                    <ul className="space-y-1.5">
                                                        {selectedPostForDetail.attachments.map((attachment) => (
                                                            <li key={attachment.id || attachment.storagePath}>
                                                                <a
                                                                    href={attachment.fileUrl}
                                                                    target="_blank"
                                                                    rel="noreferrer"
                                                                    className="text-sm text-gray-700 underline-offset-2 hover:underline"
                                                                >
                                                                    {attachment.originalFilename}
                                                                </a>
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            )}
                                            {(canEditPost(selectedPostForDetail) || canDeletePost(selectedPostForDetail)) && (
                                                <div className="flex justify-end gap-2 pt-2">
                                                    {canEditPost(selectedPostForDetail) && (
                                                        <button
                                                            type="button"
                                                            onClick={() => openPostEditFromDetail(selectedPostForDetail)}
                                                            disabled={isSubmitting || isActionSubmitting}
                                                            className="rounded-md border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-60 cursor-pointer"
                                                        >
                                                            수정
                                                        </button>
                                                    )}
                                                    {canDeletePost(selectedPostForDetail) && (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleDeleteFromDetail(selectedPostForDetail.id)}
                                                            disabled={isActionSubmitting}
                                                            className="rounded-md border border-red-100 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 disabled:opacity-60 cursor-pointer"
                                                        >
                                                            삭제
                                                        </button>
                                                    )}
                                                </div>
                                            )}
                                        </article>
                                    ) : null}

                                    <ProjectItemCommentSection
                                        key={selectedDetailItem.id}
                                        itemId={selectedDetailItem.id}
                                        comments={selectedDetailComments}
                                        canWriteComment={canCreateBoard}
                                        onSubmitComment={handleSubmitBoardComment}
                                    />
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {isProjectSettingsModalOpen && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6">
                    <div
                        className="fixed inset-0 bg-black/40 backdrop-blur-sm cursor-pointer"
                        onClick={closeProjectSettingsModal}
                        aria-hidden="true"
                    />
                    <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-[#EED7DB] bg-[#FFF8F9]">
                            <h2 className="text-xl font-bold text-[#5E4246]">프로젝트 수정</h2>
                            <button
                                type="button"
                                onClick={closeProjectSettingsModal}
                                className="p-2 hover:bg-[#FCEBF0] rounded-full text-[#A8646E] transition-colors cursor-pointer"
                                disabled={isProjectSettingsSubmitting}
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="px-6 pt-4 border-b border-[#EED7DB] bg-white">
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setProjectSettingsTab('BASIC')}
                                    className={clsx(
                                        'px-3 py-2 text-sm rounded-t-lg border border-b-0 transition-colors cursor-pointer',
                                        projectSettingsTab === 'BASIC'
                                            ? 'bg-[#FFF8F9] border-[#EED7DB] text-[#8E4C56] font-semibold'
                                            : 'bg-white border-transparent text-gray-500 hover:text-gray-700'
                                    )}
                                    disabled={isProjectSettingsSubmitting}
                                >
                                    기본 정보
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setProjectSettingsTab('MANAGE')}
                                    className={clsx(
                                        'px-3 py-2 text-sm rounded-t-lg border border-b-0 transition-colors cursor-pointer',
                                        projectSettingsTab === 'MANAGE'
                                            ? 'bg-[#FFF8F9] border-[#EED7DB] text-[#8E4C56] font-semibold'
                                            : 'bg-white border-transparent text-gray-500 hover:text-gray-700'
                                    )}
                                    disabled={isProjectSettingsSubmitting}
                                >
                                    프로젝트 관리
                                </button>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 space-y-6">
                            {projectSettingsTab === 'BASIC' ? (
                                <form id="project-settings-form" onSubmit={handleSaveProjectSettings} className="space-y-6">
                                    <div className="space-y-3">
                                        <label className="block text-sm font-semibold text-[#5E4246]">프로젝트 제목</label>
                                        <input
                                            type="text"
                                            className="w-full px-4 py-3 bg-[#FFF8F9] border border-[#EED7DB] rounded-lg focus:ring-2 focus:outline-none text-gray-900 placeholder:text-gray-400"
                                            placeholder="프로젝트 이름"
                                            value={projectForm.name}
                                            onChange={(e) => setProjectForm((prev) => ({ ...prev, name: e.target.value }))}
                                            disabled={isProjectSettingsSubmitting}
                                        />
                                    </div>

                                    <div className="space-y-3">
                                        <label className="block text-sm font-semibold text-[#5E4246]">프로젝트 요약</label>
                                        <textarea
                                            className="w-full min-h-24 px-4 py-3 bg-[#FFF8F9] border border-[#EED7DB] rounded-lg focus:ring-2 focus:outline-none text-gray-900 placeholder:text-gray-400"
                                            placeholder="프로젝트 설명"
                                            value={projectForm.description}
                                            onChange={(e) => setProjectForm((prev) => ({ ...prev, description: e.target.value }))}
                                            disabled={isProjectSettingsSubmitting}
                                        />
                                    </div>

                                    <div className="space-y-3">
                                        <label className="block text-sm font-semibold text-[#5E4246]">말머리</label>
                                        <input
                                            type="text"
                                            className="w-full px-4 py-3 bg-[#FFF8F9] border border-[#EED7DB] rounded-lg focus:ring-2 focus:outline-none text-gray-900 placeholder:text-gray-400"
                                            placeholder="예: 기획, 디자인, 개발"
                                            value={projectForm.category}
                                            onChange={(e) => setProjectForm((prev) => ({ ...prev, category: e.target.value }))}
                                            disabled={isProjectSettingsSubmitting}
                                        />
                                    </div>

                                    <div className="space-y-3">
                                        <label className="block text-sm font-semibold text-[#5E4246]">부서 태그</label>
                                        <input
                                            type="text"
                                            value={projectTagInput}
                                            onChange={(e) => setProjectTagInput(e.target.value)}
                                            onCompositionStart={() => setIsTagComposing(true)}
                                            onCompositionEnd={() => setIsTagComposing(false)}
                                            onKeyDown={handleProjectTagKeyDown}
                                            className="w-full px-4 py-3 bg-[#FFF8F9] border border-[#EED7DB] rounded-lg focus:ring-2 focus:outline-none text-gray-900 placeholder:text-gray-400"
                                            placeholder="태그 입력 후 Enter"
                                            disabled={isProjectSettingsSubmitting}
                                        />
                                        <div className="flex flex-wrap gap-2 min-h-8">
                                            {projectForm.tags.length === 0 && (
                                                <p className="text-xs text-gray-400">등록된 부서 태그가 없습니다.</p>
                                            )}
                                            {projectForm.tags.map((tag, index) => (
                                                <span
                                                    key={`${tag}-${index}`}
                                                    className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium text-white"
                                                    style={{ backgroundColor: projectForm.themeColor }}
                                                >
                                                    {tag}
                                                    <button
                                                        type="button"
                                                        onClick={() => handleProjectTagRemove(tag)}
                                                        className="ml-2 hover:text-red-100 focus:outline-none cursor-pointer"
                                                        disabled={isProjectSettingsSubmitting}
                                                    >
                                                        <X className="w-3 h-3" />
                                                    </button>
                                                </span>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="space-y-3">
                                        <label className="block text-sm font-semibold text-[#5E4246]">테마 색상</label>
                                        <div className="flex gap-2 flex-wrap">
                                            {THEME_COLORS.map((color) => (
                                                <button
                                                    type="button"
                                                    key={color}
                                                    onClick={() => setProjectForm((prev) => ({ ...prev, themeColor: color }))}
                                                    className={clsx(
                                                        'w-8 h-8 rounded-full border-2 cursor-pointer',
                                                        projectForm.themeColor === color ? 'border-gray-900' : 'border-transparent'
                                                    )}
                                                    style={{ backgroundColor: color }}
                                                    title={color}
                                                    disabled={isProjectSettingsSubmitting}
                                                />
                                            ))}
                                        </div>
                                    </div>

                                    <div className="space-y-3">
                                        <label className="block text-sm font-semibold text-[#5E4246]">공개 범위</label>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                            <button
                                                type="button"
                                                onClick={() => setProjectForm((prev) => ({ ...prev, visibility: 'public' }))}
                                                className={clsx(
                                                    'rounded-lg border px-4 py-3 text-left transition-colors cursor-pointer',
                                                    projectForm.visibility === 'public'
                                                        ? 'border-[#B95D69] bg-[#FFF0F3] text-black'
                                                        : 'border-[#EED7DB] bg-white text-gray-700 hover:bg-[#FFF8F9]'
                                                )}
                                                disabled={isProjectSettingsSubmitting}
                                            >
                                                <p className={clsx('text-sm font-semibold', projectForm.visibility === 'public' ? 'text-black' : 'text-gray-700')}>
                                                    전체 공개
                                                </p>
                                                <p className={clsx('text-xs mt-1', projectForm.visibility === 'public' ? 'text-black' : 'text-gray-500')}>
                                                    모든 사용자가 프로젝트를 볼 수 있습니다.
                                                </p>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setProjectForm((prev) => ({ ...prev, visibility: 'private' }))}
                                                className={clsx(
                                                    'rounded-lg border px-4 py-3 text-left transition-colors cursor-pointer',
                                                    projectForm.visibility === 'private'
                                                        ? 'border-[#B95D69] bg-[#FFF0F3] text-black'
                                                        : 'border-[#EED7DB] bg-white text-gray-700 hover:bg-[#FFF8F9]'
                                                )}
                                                disabled={isProjectSettingsSubmitting}
                                            >
                                                <p className={clsx('text-sm font-semibold', projectForm.visibility === 'private' ? 'text-black' : 'text-gray-700')}>
                                                    비공개
                                                </p>
                                                <p className={clsx('text-xs mt-1', projectForm.visibility === 'private' ? 'text-black' : 'text-gray-500')}>
                                                    초대된 멤버만 프로젝트를 볼 수 있습니다.
                                                </p>
                                            </button>
                                        </div>
                                    </div>

                                    <div className="space-y-3">
                                        <label className="block text-sm font-semibold text-[#5E4246]">참여 멤버</label>
                                        <div className="relative">
                                            <input
                                                type="text"
                                                className="w-full px-4 py-3 bg-[#FFF8F9] border border-[#EED7DB] rounded-lg focus:ring-2 focus:outline-none text-gray-900 placeholder:text-gray-400"
                                                placeholder="이름/닉네임 검색 (예: 김 또는 ㄱ)"
                                                value={projectSettingsMemberInput}
                                                onCompositionStart={() => setIsProjectSettingsMemberComposing(true)}
                                                onCompositionEnd={() => setIsProjectSettingsMemberComposing(false)}
                                                onChange={(e) => setProjectSettingsMemberInput(e.target.value)}
                                                onKeyDown={handleProjectSettingsMemberKeyDown}
                                                onFocus={() => setIsProjectSettingsMemberInputFocused(true)}
                                                onBlur={() => setIsProjectSettingsMemberInputFocused(false)}
                                                disabled={isProjectSettingsSubmitting}
                                            />

                                            {showProjectSettingsSuggestions && (
                                                <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-56 overflow-y-auto rounded-lg border border-[#EED7DB] bg-white shadow-lg">
                                                    {isProjectSettingsCandidatesLoading ? (
                                                        <p className="px-3 py-2 text-xs text-gray-500">사용자 목록을 불러오는 중입니다.</p>
                                                    ) : projectSettingsCandidatesError ? (
                                                        <p className="px-3 py-2 text-xs text-red-600">{projectSettingsCandidatesError}</p>
                                                    ) : filteredProjectSettingsCandidates.length === 0 ? (
                                                        <p className="px-3 py-2 text-xs text-gray-500">일치하는 사용자가 없습니다.</p>
                                                    ) : (
                                                        <ul className="py-1">
                                                            {filteredProjectSettingsCandidates.map((candidate) => (
                                                                <li key={candidate.userId}>
                                                                    <button
                                                                        type="button"
                                                                        onMouseDown={(event) => event.preventDefault()}
                                                                        onClick={() => handleSelectProjectSettingsMember(candidate)}
                                                                        className="w-full px-3 py-2 text-left text-sm text-gray-800 hover:bg-[#FFF3F6] cursor-pointer"
                                                                        disabled={isProjectSettingsSubmitting}
                                                                    >
                                                                        {formatCandidateLabel(candidate)}
                                                                    </button>
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                        <p className="text-xs text-gray-500">목록에서 선택한 사용자만 참여 멤버로 반영됩니다.</p>
                                        <div className="flex flex-wrap gap-2 min-h-8">
                                            {projectSettingsSelectedMembers.length === 0 && (
                                                <p className="text-xs text-gray-400">참여 멤버가 없습니다.</p>
                                            )}
                                            {projectSettingsSelectedMembers.map((member) => (
                                                <span
                                                    key={member.userId}
                                                    className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium text-white"
                                                    style={{ backgroundColor: projectForm.themeColor }}
                                                >
                                                    {formatCandidateLabel(member)}
                                                    <button
                                                        type="button"
                                                        onClick={() => handleRemoveProjectSettingsMember(member.userId)}
                                                        className="ml-2 hover:text-red-100 focus:outline-none cursor-pointer"
                                                        disabled={isProjectSettingsSubmitting}
                                                    >
                                                        <X className="w-3 h-3" />
                                                    </button>
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                </form>
                            ) : (
                                <div className="space-y-5">
                                    <section className="rounded-lg border border-[#EED7DB] p-4 space-y-3 bg-white">
                                        <SectionTitle title="참여 신청" />
                                        {joinRequests.length === 0 ? (
                                            <p className="text-sm text-gray-500">현재 처리할 참여 신청이 없습니다.</p>
                                        ) : (
                                            <div className="space-y-2">
                                                {joinRequests.map((request) => (
                                                    <div key={request.id} className="rounded-lg border border-[#EED7DB] px-3 py-2 space-y-2">
                                                        <div>
                                                            <p className="text-sm font-semibold text-gray-800">{request.requesterName}</p>
                                                            <p className="text-xs text-gray-500">{request.requesterEmail}</p>
                                                            <p className="text-xs text-gray-500 mt-1">요청 메모: {request.message || '-'}</p>
                                                        </div>
                                                        <div className="flex gap-2">
                                                            <button
                                                                type="button"
                                                                onClick={() => void handleJoinRequestReview(request.id, 'APPROVED')}
                                                                className="px-3 py-1.5 text-xs text-gray-900 rounded-md border border-[#EED7DB] hover:bg-[#FFF8F9] cursor-pointer"
                                                                disabled={isActionSubmitting}
                                                            >
                                                                승인
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => void handleJoinRequestReview(request.id, 'REJECTED')}
                                                                className="px-3 py-1.5 text-xs text-gray-900 rounded-md border border-[#EED7DB] hover:bg-[#FFF8F9] cursor-pointer"
                                                                disabled={isActionSubmitting}
                                                            >
                                                                거절
                                                            </button>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </section>

                                    <section className="rounded-lg border border-[#EED7DB] p-4 space-y-3 bg-white">
                                        <SectionTitle title="팀장 위임" />
                                        {transferCandidateMembers.length === 0 ? (
                                            <p className="text-sm text-gray-500">위임 가능한 팀원이 없습니다.</p>
                                        ) : (
                                            <form onSubmit={handleTransferLeader} className="space-y-2">
                                                <select
                                                    value={transferMemberId}
                                                    onChange={(e) => setTransferMemberId(e.target.value)}
                                                    className="w-full border border-[#EED7DB] h-11 px-3 rounded-lg text-sm text-gray-900"
                                                    disabled={isActionSubmitting}
                                                >
                                                    <option value="">팀원 선택</option>
                                                    {transferCandidateMembers.map((member) => (
                                                        <option key={member.id} value={member.id}>
                                                            {member.name}
                                                        </option>
                                                    ))}
                                                </select>
                                                <div className="flex justify-end">
                                                    <button
                                                        type="submit"
                                                        disabled={isActionSubmitting || !transferMemberId}
                                                        className="px-4 py-2 rounded-lg text-white font-semibold text-sm disabled:opacity-60 cursor-pointer"
                                                        style={{ backgroundColor: project.themeColor }}
                                                    >
                                                        위임하기
                                                    </button>
                                                </div>
                                            </form>
                                        )}
                                    </section>
                                </div>
                            )}
                        </div>

                        <div className="px-6 py-4 border-t border-[#EED7DB] bg-[#FFF8F9] flex items-center justify-between gap-3 rounded-b-xl">
                            <div>
                                {projectSettingsTab === 'BASIC' && (isProjectAdmin || isLeader) && (
                                    <button
                                        type="button"
                                        onClick={() => void handleDeleteProject()}
                                        disabled={isProjectSettingsSubmitting || isDeletingProject}
                                        className="px-6 py-2.5 rounded-lg border border-red-200 text-red-600 bg-white hover:bg-red-50 font-medium transition-colors disabled:opacity-60 cursor-pointer"
                                    >
                                        {isDeletingProject ? '삭제 중...' : '삭제'}
                                    </button>
                                )}
                            </div>
                            <div className="flex justify-end gap-3">
                                <button
                                    type="button"
                                    onClick={closeProjectSettingsModal}
                                    disabled={isProjectSettingsSubmitting}
                                    className="px-6 py-2.5 rounded-lg border border-[#EED7DB] text-gray-600 bg-white hover:bg-gray-50 font-medium transition-colors cursor-pointer"
                                >
                                    취소
                                </button>
                                {projectSettingsTab === 'BASIC' ? (
                                    <button
                                        type="submit"
                                        form="project-settings-form"
                                        disabled={isProjectSettingsSubmitting}
                                        className="px-6 py-2.5 rounded-lg text-white font-medium shadow-sm transition-colors opacity-90 hover:opacity-100 cursor-pointer"
                                        style={{ backgroundColor: projectForm.themeColor }}
                                    >
                                        {isProjectSettingsSubmitting ? '저장 중...' : '변경 저장'}
                                    </button>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={closeProjectSettingsModal}
                                        className="px-6 py-2.5 rounded-lg text-white font-medium shadow-sm transition-colors opacity-90 hover:opacity-100 cursor-pointer"
                                        style={{ backgroundColor: projectForm.themeColor }}
                                    >
                                        완료
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <CreatePostModal
                isOpen={isCreateModalOpen}
                onClose={() => {
                    setIsCreateModalOpen(false);
                    setEditingBoardItem(null);
                }}
                onSubmit={handleSubmitBoardItem}
                statusTabs={STATUS_TABS}
                categoryTabs={categoryTabs}
                assigneeOptions={assigneeOptions}
                isSubmitting={isSubmitting}
                mode={editingBoardItem ? 'EDIT' : 'CREATE'}
                editItem={editingBoardItem}
            />

            {/* Leave Confirmation Modal */}
            {showLeaveConfirm && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40" onClick={() => setShowLeaveConfirm(false)}>
                    <div className="bg-white rounded-2xl shadow-2xl p-6 mx-4 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
                        <h3 className="text-lg font-bold text-gray-900 mb-2">프로젝트 나가기</h3>
                        <p className="text-sm text-gray-600 mb-6">정말 해당 프로젝트에서 나가시겠습니까?</p>
                        <div className="flex gap-3">
                            <button
                                type="button"
                                onClick={() => setShowLeaveConfirm(false)}
                                className="flex-1 h-10 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 cursor-pointer"
                            >
                                취소
                            </button>
                            <button
                                type="button"
                                onClick={() => void confirmLeaveProject()}
                                disabled={isLeavingProject}
                                className="flex-1 h-10 rounded-lg bg-red-500 text-sm font-medium text-white hover:bg-red-600 cursor-pointer disabled:opacity-50"
                            >
                                {isLeavingProject ? '처리 중...' : '나가기'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {showDeleteConfirm && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40" onClick={() => setShowDeleteConfirm(false)}>
                    <div className="bg-white rounded-2xl shadow-2xl p-6 mx-4 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
                        <h3 className="text-lg font-bold text-gray-900 mb-2">프로젝트 삭제</h3>
                        <p className="text-sm text-gray-600 mb-1">정말 삭제하시겠습니까? 삭제 시 모든 정보는 사라집니다.</p>
                        <p className="text-sm text-gray-600 mb-4">&quot;삭제하기&quot;를 입력하면 프로젝트가 삭제됩니다.</p>
                        <input
                            type="text"
                            value={deleteConfirmInput}
                            onChange={(e) => setDeleteConfirmInput(e.target.value)}
                            placeholder="삭제하기"
                            className="w-full h-10 px-3 border border-gray-200 rounded-lg text-sm text-gray-900 mb-4"
                            autoFocus
                        />
                        <div className="flex gap-3">
                            <button
                                type="button"
                                onClick={() => setShowDeleteConfirm(false)}
                                className="flex-1 h-10 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 cursor-pointer"
                            >
                                취소
                            </button>
                            <button
                                type="button"
                                onClick={() => void confirmDeleteProject()}
                                disabled={isDeletingProject || deleteConfirmInput.trim() !== '삭제하기'}
                                className="flex-1 h-10 rounded-lg bg-red-500 text-sm font-medium text-white hover:bg-red-600 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isDeletingProject ? '처리 중...' : '삭제'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
