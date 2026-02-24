'use client';

import React, { useEffect, useMemo, useState, use } from 'react';
import { notFound } from 'next/navigation';
import { AlertCircle, Loader2, MessageSquare, PenTool } from 'lucide-react';
import { clsx } from 'clsx';
import { useUI } from '@/context/UIContext';
import { ProjectHeader } from '@/components/project/ProjectHeader';
import { TabSwiper } from '@/components/common/TabSwiper';
import { TaskCard } from '@/components/task/TaskCard';
import { CreatePostModal } from '@/components/modals/CreatePostModal';
import { createProjectBoardItem, listProjectBoardItems, listProjectMembers } from '@/lib/api/projectBoard';
import { toErrorMessage } from '@/lib/api/errors';
import { useAuth } from '@/context/AuthContext';
import type { CreateProjectItemInput, ProjectMemberOption, ProjectPost, Task } from '@/types/workflow';

const STATUS_TABS = [
    { id: 'REQUEST', label: '요청' },
    { id: 'PROGRESS', label: '진행' },
    { id: 'FEEDBACK', label: '피드백' },
    { id: 'REVIEW', label: '검수완료' },
    { id: 'DONE', label: '완료' },
    { id: 'ISSUE', label: '이슈' },
    { id: 'HOLD', label: '보류' },
];

const CATEGORY_TABS = [
    { id: 'ALL', label: '전체' },
    { id: 'PLANNING', label: '기획' },
    { id: 'DESIGN', label: '디자인' },
    { id: 'DEV', label: '개발' },
    { id: 'QA', label: '검수팀' },
];

const BOARD_TABS = [
    { id: 'TASK', label: '업무 목록' },
    { id: 'POST', label: '글 목록' },
];

type BoardTabType = 'TASK' | 'POST';

const STATUS_COLORS: Record<string, string> = {
    REQUEST: '#3B82F6',
    PROGRESS: '#F59E0B',
    FEEDBACK: '#8B5CF6',
    REVIEW: '#06B6D4',
    DONE: '#059669',
    ISSUE: '#EF4444',
    HOLD: '#6B7280',
};

export default function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
    const resolvedParams = use(params);
    const { id } = resolvedParams;
    const { projects, isProjectsLoading, toggleProjectFavorite } = useUI();
    const { displayName } = useAuth();

    const project = useMemo(
        () => projects.find((currentProject) => currentProject.id === id),
        [projects, id]
    );

    const [activeBoardTab, setActiveBoardTab] = useState<BoardTabType>('TASK');
    const [activeStatusTab, setActiveStatusTab] = useState('REQUEST');
    const [activeCategoryTab, setActiveCategoryTab] = useState('ALL');
    const [tasks, setTasks] = useState<Task[]>([]);
    const [posts, setPosts] = useState<ProjectPost[]>([]);
    const [memberOptions, setMemberOptions] = useState<ProjectMemberOption[]>([]);

    const [isBoardLoading, setIsBoardLoading] = useState(true);
    const [boardError, setBoardError] = useState<string | null>(null);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isFavoriteUpdating, setIsFavoriteUpdating] = useState(false);

    const loadProjectBoard = async (projectId: string) => {
        const [boardItems, members] = await Promise.all([
            listProjectBoardItems(projectId),
            listProjectMembers(projectId),
        ]);

        setTasks(boardItems.tasks);
        setPosts(boardItems.posts);
        setMemberOptions(members);
    };

    useEffect(() => {
        if (!project) {
            if (!isProjectsLoading) {
                setIsBoardLoading(false);
            }
            return;
        }

        let isActive = true;

        const initialize = async () => {
            setIsBoardLoading(true);
            setBoardError(null);

            try {
                const [boardItems, members] = await Promise.all([
                    listProjectBoardItems(project.id),
                    listProjectMembers(project.id),
                ]);

                if (!isActive) {
                    return;
                }

                setTasks(boardItems.tasks);
                setPosts(boardItems.posts);
                setMemberOptions(members);
            } catch (error) {
                if (isActive) {
                    setBoardError(toErrorMessage(error, '프로젝트 데이터를 불러오지 못했습니다.'));
                }
            } finally {
                if (isActive) {
                    setIsBoardLoading(false);
                }
            }
        };

        void initialize();

        return () => {
            isActive = false;
        };
    }, [project, isProjectsLoading]);

    const filteredTasks = useMemo(
        () => tasks.filter((task) => {
            const isStatusMatched = task.status === activeStatusTab;
            const isCategoryMatched = activeCategoryTab === 'ALL' || task.category === activeCategoryTab;
            return isStatusMatched && isCategoryMatched;
        }),
        [tasks, activeStatusTab, activeCategoryTab]
    );

    const filteredPosts = useMemo(
        () => posts.filter((post) => activeCategoryTab === 'ALL' || post.category === activeCategoryTab),
        [posts, activeCategoryTab]
    );

    const handleRetry = async () => {
        if (!project) {
            return;
        }

        try {
            setIsBoardLoading(true);
            setBoardError(null);
            await loadProjectBoard(project.id);
        } catch (error) {
            setBoardError(toErrorMessage(error, '프로젝트 데이터를 다시 불러오지 못했습니다.'));
        } finally {
            setIsBoardLoading(false);
        }
    };

    const handleCreateItem = async (data: CreateProjectItemInput): Promise<boolean> => {
        if (!project || isSubmitting) {
            return false;
        }

        try {
            setIsSubmitting(true);
            await createProjectBoardItem(project.id, data, displayName);
            await loadProjectBoard(project.id);
            return true;
        } catch (error) {
            alert(toErrorMessage(error, '작성 저장 중 오류가 발생했습니다.'));
            return false;
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleToggleProjectFavorite = async () => {
        if (!project || isFavoriteUpdating) {
            return;
        }

        try {
            setIsFavoriteUpdating(true);
            await toggleProjectFavorite(project.id, !project.isFavorite);
        } catch (error) {
            alert(toErrorMessage(error, '즐겨찾기 상태를 변경하지 못했습니다.'));
        } finally {
            setIsFavoriteUpdating(false);
        }
    };

    if (isProjectsLoading) {
        return (
            <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8 min-h-screen flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
        );
    }

    if (!project) {
        return notFound();
    }

    return (
        <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8 min-h-screen pb-20">
            <ProjectHeader
                project={project}
                onToggleFavorite={handleToggleProjectFavorite}
                isFavoriteUpdating={isFavoriteUpdating}
            />

            <div className="mb-6 mt-4 -mx-4 px-4 sm:mx-0 sm:px-0">
                <TabSwiper
                    tabs={STATUS_TABS}
                    activeTabId={activeStatusTab}
                    onTabClick={setActiveStatusTab}
                    themeColor={project.themeColor}
                    variant="STATUS"
                    colorMap={STATUS_COLORS}
                />
            </div>

            <div className="sticky top-16 bg-white/95 backdrop-blur-sm z-40 py-1 mb-4 -mx-4 px-4 sm:mx-0 sm:px-0 border-b border-gray-100">
                <div className="overflow-x-auto scrollbar-hide">
                    <div className="flex items-center gap-6 min-w-max">
                        {BOARD_TABS.map((tab) => {
                            const isActive = activeBoardTab === tab.id;
                            return (
                                <button
                                    key={tab.id}
                                    type="button"
                                    onClick={() => setActiveBoardTab(tab.id as BoardTabType)}
                                    className={clsx(
                                        "relative py-2.5 text-sm font-semibold whitespace-nowrap transition-colors cursor-pointer",
                                        isActive ? "text-gray-900" : "text-gray-400 hover:text-gray-600"
                                    )}
                                >
                                    {tab.label}
                                    <span
                                        className={clsx(
                                            "absolute left-0 right-0 bottom-0 h-0.5 rounded-full transition-colors",
                                            isActive ? "bg-gray-900" : "bg-transparent"
                                        )}
                                    />
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>

            <div className="bg-white/95 backdrop-blur-sm z-30 py-2 mb-2 -mx-4 px-4 sm:mx-0 sm:px-0 border-b border-gray-50/50">
                <TabSwiper
                    tabs={CATEGORY_TABS}
                    activeTabId={activeCategoryTab}
                    onTabClick={setActiveCategoryTab}
                    themeColor={project.themeColor}
                    variant="CATEGORY"
                />
            </div>

            {boardError && (
                <div className="mb-4 flex items-center justify-between gap-2 rounded-xl border border-red-100 bg-red-50 px-4 py-3">
                    <div className="flex items-center gap-2 text-sm text-red-500">
                        <AlertCircle className="w-4 h-4" />
                        <span>{boardError}</span>
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
                <section className="space-y-4">
                    <h2 className="text-base font-bold text-gray-800">업무 목록</h2>
                    {isBoardLoading && (
                        <div className="flex items-center justify-center py-8">
                            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                        </div>
                    )}
                    {!isBoardLoading && filteredTasks.length === 0 && !boardError && (
                        <div className="text-sm text-gray-400 bg-white border border-dashed border-gray-200 rounded-xl px-4 py-6 text-center">
                            선택한 상태/카테고리에 맞는 업무가 없습니다.
                        </div>
                    )}
                    {!isBoardLoading && filteredTasks.map((task) => (
                        <TaskCard
                            key={task.id}
                            task={task}
                            themeColor={project.themeColor}
                        />
                    ))}
                </section>
            )}

            {activeBoardTab === 'POST' && (
                <section className="space-y-4">
                    <h2 className="text-base font-bold text-gray-800 flex items-center">
                        <MessageSquare className="w-4 h-4 mr-2 text-gray-500" />
                        글 목록
                    </h2>
                    {isBoardLoading && (
                        <div className="flex items-center justify-center py-4">
                            <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                        </div>
                    )}
                    {!isBoardLoading && filteredPosts.length === 0 && !boardError && (
                        <div className="text-sm text-gray-400 bg-white border border-dashed border-gray-200 rounded-xl px-4 py-6 text-center">
                            아직 작성된 글이 없습니다.
                        </div>
                    )}
                    {!isBoardLoading && filteredPosts.map((post) => (
                        <div
                            key={post.id}
                            className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm space-y-2"
                        >
                            <div className="flex justify-between items-start gap-2">
                                <h3 className="text-base font-bold text-gray-900">{post.title}</h3>
                                <span className="text-xs text-gray-400 whitespace-nowrap">{post.createdAt}</span>
                            </div>
                            <p className="text-sm text-gray-600 leading-relaxed">{post.content}</p>
                            <div className="flex items-center justify-between text-xs text-gray-400">
                                <span>{post.author}</span>
                                <span>{post.commentCount} 댓글</span>
                            </div>
                        </div>
                    ))}
                </section>
            )}

            <button
                onClick={() => setIsCreateModalOpen(true)}
                className="fixed bottom-6 right-6 w-14 h-14 bg-gray-900 text-white rounded-full shadow-2xl flex items-center justify-center hover:bg-gray-800 transition-transform hover:scale-105 active:scale-95 z-50 group"
            >
                <PenTool className="w-6 h-6 group-hover:rotate-12 transition-transform" />
            </button>

            <CreatePostModal
                isOpen={isCreateModalOpen}
                onClose={() => setIsCreateModalOpen(false)}
                onSubmit={handleCreateItem}
                statusTabs={STATUS_TABS}
                categoryTabs={CATEGORY_TABS}
                assigneeOptions={memberOptions}
                isSubmitting={isSubmitting}
            />
        </div>
    );
}
