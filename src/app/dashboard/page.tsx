'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Star, Users, Briefcase, Calendar, Plus } from 'lucide-react';
import { useUI } from '@/context/UIContext';
import { useAuth } from '@/context/AuthContext';
import { createProjectJoinRequest } from '@/lib/api/projectCollaboration';
import { listMyProjectMembershipProjectIds } from '@/lib/api/projectCollaboration';
import { toErrorMessage } from '@/lib/api/errors';
import { isAnomalyBlockedError } from '@/lib/api/client';
import type { ProjectItem } from '@/types/project';
import { useRouter } from 'next/navigation';
import { clsx } from 'clsx';

const STATUS_LABELS: Record<string, string> = {
    REQUEST: '요청',
    PROGRESS: '진행',
    FEEDBACK: '피드백',
    REVIEW: '검수완료',
    DONE: '완료',
    HOLD: '보류',
    ISSUE: '이슈',
};

interface ProjectCardProps {
    project: ProjectItem;
    onToggleFavorite: (project: ProjectItem) => Promise<void>;
    onRequestJoin: (project: ProjectItem) => Promise<void>;
    isFavoriteUpdating: boolean;
    isJoinRequesting: boolean;
    canToggleFavorite: boolean;
    canRequestJoin: boolean;
}

const ProjectCard = ({ project, onToggleFavorite, onRequestJoin, isFavoriteUpdating, isJoinRequesting, canToggleFavorite, canRequestJoin }: ProjectCardProps) => {
    const [isHovered, setIsHovered] = useState(false);

    const formatDateRange = (start?: string, end?: string): React.ReactNode => {
        const highlightClass = "text-[#B95D69] font-medium ml-1";

        if (start && end) {
            return (
                <>
                    {start} ~ <span className={highlightClass}>{end}</span>
                </>
            );
        }
        if (start) {
            return (
                <>
                    {start} ~
                </>
            );
        }
        if (end) {
            return (
                <>
                    ~ <span className={highlightClass}>{end}</span>
                </>
            );
        }
        return '미정';
    };

    return (
        <Link
            href={`/project/${project.id}`}
            className="block border rounded-xl p-5 transition-all duration-300 group relative shadow-sm hover:shadow-md flex flex-col h-full"
            style={{
                backgroundColor: `${project.themeColor}10`,
                borderColor: isHovered ? project.themeColor : `${project.themeColor}33`,
            }}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            <div className="flex justify-between items-start mb-3">
                <span
                    className="text-xs font-semibold px-2 py-1 rounded transition-colors"
                    style={{
                        backgroundColor: '#ffffff80',
                        color: project.themeColor
                    }}
                >
                    {project.category}
                </span>
                <span
                    className="text-[10px] font-medium px-1.5 py-0.5 rounded"
                    style={{
                        backgroundColor: `${project.themeColor}20`,
                        color: project.themeColor,
                    }}
                >
                    {STATUS_LABELS[project.status] ?? '요청'}
                </span>
                <button
                    type="button"
                    disabled={isFavoriteUpdating || !canToggleFavorite}
                    onClick={async (e) => {
                        if (!canToggleFavorite) {
                            return;
                        }

                        e.preventDefault();
                        e.stopPropagation();
                        await onToggleFavorite(project);
                    }}
                    className={clsx(
                        'p-1 rounded-full transition-colors disabled:opacity-50',
                        canToggleFavorite
                            ? 'hover:bg-white/70 cursor-pointer'
                            : 'cursor-not-allowed'
                    )}
                    aria-label={project.isFavorite ? '즐겨찾기 해제' : '즐겨찾기 추가'}
                    title={project.isFavorite ? '즐겨찾기 해제' : '즐겨찾기 추가'}
                >
                    <Star
                        className={project.isFavorite ? 'w-4 h-4 text-yellow-400 fill-yellow-400' : 'w-4 h-4 text-gray-300'}
                    />
                </button>
            </div>
            {canRequestJoin && (
                <button
                    type="button"
                    onClick={async (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        await onRequestJoin(project);
                    }}
                    disabled={isJoinRequesting}
                    className={clsx(
                        'absolute -bottom-4 -right-4 w-8 h-8 rounded-full flex items-center justify-center text-white shadow-md transition-colors border border-white cursor-pointer z-10',
                        isJoinRequesting ? 'bg-gray-300 cursor-not-allowed' : 'bg-[#B95D69] hover:bg-[#A04C58]'
                    )}
                    aria-label="프로젝트 참여 신청"
                    title="프로젝트 참여 신청"
                >
                    <Plus className="w-4 h-4" />
                </button>
            )}

            <h3 className="text-lg font-bold text-gray-900 mb-2 line-clamp-1">
                {project.name}
            </h3>

            <p className="text-sm text-gray-500 mb-4 line-clamp-3 min-h-[60px]">
                {project.description}
            </p>

            <div className="flex flex-wrap gap-1 mb-4 min-h-[24px]">
                {project.tags?.map((tag: string, index: number) => (
                    <span
                        key={index}
                        className="inline-flex items-center justify-center text-[10px] px-1.5 py-0.5 rounded text-gray-500 bg-gray-100"
                    >
                        {tag}
                    </span>
                ))}
            </div>

            <div className="flex justify-between items-center text-xs text-gray-400 border-t border-gray-100 pt-3 mt-auto w-full">
                <div className="flex items-center shrink-0">
                    <Users className="w-3 h-3 mr-1" />
                    <span>{project.members}명</span>
                </div>
                <div className="flex items-center justify-end min-w-0">
                    <Calendar className="w-3 h-3 mr-1 shrink-0" />
                    <span className="truncate">{formatDateRange(project.startDate, project.endDate)}</span>
                </div>
            </div>
        </Link>
    );
};

export default function DashboardPage() {
    const { openCreateProjectModal, projects, isProjectsLoading, projectsError, searchKeyword, toggleProjectFavorite } = useUI();
    const { isAuthenticated, user, profile, displayName } = useAuth();
    const router = useRouter();
    const [updatingFavoriteProjectId, setUpdatingFavoriteProjectId] = useState<string | null>(null);
    const [requestingJoinProjectId, setRequestingJoinProjectId] = useState<string | null>(null);
    const [myMembershipProjectIds, setMyMembershipProjectIds] = useState<string[]>([]);
    const [isMembershipLoaded, setIsMembershipLoaded] = useState(false);

    useEffect(() => {
        let isMounted = true;

        const loadMyMembershipProjectIds = async () => {
            if (!isAuthenticated || !user?.id) {
                if (isMounted) {
                    setMyMembershipProjectIds([]);
                    setIsMembershipLoaded(true);
                }
                return;
            }

            try {
                const projectIds = await listMyProjectMembershipProjectIds({
                    userId: user.id,
                    email: profile?.email ?? user.email ?? '',
                });
                if (!isMounted) {
                    return;
                }
                setMyMembershipProjectIds(Array.from(new Set(projectIds.map((projectId) => projectId.trim()).filter(Boolean))));
            } catch (error) {
                if (!isMounted || isAnomalyBlockedError(error)) {
                    return;
                }
                setMyMembershipProjectIds([]);
            } finally {
                if (isMounted) {
                    setIsMembershipLoaded(true);
                }
            }
        };

        void loadMyMembershipProjectIds();

        return () => {
            isMounted = false;
        };
    }, [isAuthenticated, user?.id, user?.email, profile?.email, projects]);

    const keyword = searchKeyword.trim().toLowerCase();
    const filteredProjects = projects.filter((project) => {
        if (!keyword) return true;
        return (
            project.name.toLowerCase().includes(keyword) ||
            project.description.toLowerCase().includes(keyword) ||
            project.category.toLowerCase().includes(keyword) ||
            project.tags.some((tag) => tag.toLowerCase().includes(keyword))
        );
    });

    const myMembershipProjectIdSet = useMemo(
        () => new Set(myMembershipProjectIds),
        [myMembershipProjectIds]
    );
    const favoriteProjects = filteredProjects.filter((project) => project.isFavorite);
    const myProjects = filteredProjects.filter((project) => myMembershipProjectIdSet.has(project.id));
    const allProjects = filteredProjects;

    const handleToggleFavorite = async (project: ProjectItem) => {
        if (!isAuthenticated) {
            alert('즐겨찾기는 로그인 후 이용 가능합니다.');
            return;
        }

        if (updatingFavoriteProjectId) {
            return;
        }

        try {
            setUpdatingFavoriteProjectId(project.id);
            await toggleProjectFavorite(project.id, !project.isFavorite);
        } catch (error) {
            if (isAnomalyBlockedError(error)) {
                return;
            }
            alert(toErrorMessage(error, '즐겨찾기 상태를 변경하지 못했습니다.'));
        } finally {
            setUpdatingFavoriteProjectId(null);
        }
    };

    const handleRequestJoin = async (project: ProjectItem) => {
        if (!isAuthenticated) {
            router.push('/login');
            return;
        }

        if (!user) {
            alert('로그인 정보를 확인할 수 없습니다.');
            return;
        }

        if (requestingJoinProjectId) {
            return;
        }

        const shouldRequest = window.confirm('해당 프로젝트에 참여 신청 하시겠습니까?');
        if (!shouldRequest) {
            return;
        }

        try {
            setRequestingJoinProjectId(project.id);
            await createProjectJoinRequest(
                project.id,
                {
                    requesterName: displayName || user.email || '사용자',
                    requesterEmail: profile?.email ?? user.email ?? '',
                    requesterId: user.id,
                },
                {
                    userId: user.id,
                    email: profile?.email ?? user.email ?? '',
                    displayName: displayName || user.email || '사용자',
                }
            );
            alert('프로젝트 참여 신청이 접수되었습니다.');
        } catch (error) {
            if (isAnomalyBlockedError(error)) {
                return;
            }
            alert(toErrorMessage(error, '프로젝트 참여 신청을 접수하지 못했습니다.'));
        } finally {
            setRequestingJoinProjectId(null);
        }
    };

    const openCreateProject = () => {
        if (!isAuthenticated) {
            router.push('/login');
            return;
        }
        openCreateProjectModal();
    };

    const normalizedSearch = searchKeyword.trim();
    const hasSearchKeyword = Boolean(normalizedSearch);
    const isProjectsLoadError = Boolean(projectsError);
    const projectsLoadErrorMessage = `[error] ${projectsError ?? '프로젝트 목록을 불러오지 못했습니다.'}`;
    const allProjectsViewState: 'loading' | 'error' | 'empty' | 'ready' = isProjectsLoading
        ? 'loading'
        : isProjectsLoadError
            ? 'error'
            : allProjects.length === 0
                ? 'empty'
                : 'ready';

    return (
        <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8 relative min-h-screen">
            <div className="flex items-center justify-between mb-8 gap-4 flex-wrap">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
                    <p className="text-sm text-gray-500 mt-1">오늘의 업무 현황을 한눈에 확인하세요.</p>
                </div>
                <button
                    onClick={openCreateProject}
                    className="hidden md:inline-flex px-4 py-2 bg-[#B95D69] hover:bg-[#A04C58] text-white rounded-md text-sm font-medium transition-colors shadow-sm items-center cursor-pointer"
                >
                    <Plus className="w-4 h-4 mr-2" />
                    새 프로젝트
                </button>
            </div>

            <section className="mb-10">
                <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center">
                    <Star className="w-5 h-5 mr-2 text-yellow-400 fill-yellow-400" />
                    즐겨찾기한 프로젝트
                </h2>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-6">
                    {isProjectsLoading && (
                        <p className="text-sm text-gray-400">프로젝트를 불러오는 중입니다...</p>
                    )}
                    {favoriteProjects.map((project) => (
                        <ProjectCard
                            key={project.id}
                            project={project}
                            onToggleFavorite={handleToggleFavorite}
                            onRequestJoin={handleRequestJoin}
                            isFavoriteUpdating={updatingFavoriteProjectId === project.id}
                            isJoinRequesting={requestingJoinProjectId === project.id}
                            canToggleFavorite={isAuthenticated}
                            canRequestJoin={isMembershipLoaded && !myMembershipProjectIdSet.has(project.id)}
                        />
                    ))}
                    {favoriteProjects.length === 0 && !isProjectsLoading && !isProjectsLoadError && (
                        <p className="text-sm text-gray-400">
                            {hasSearchKeyword ? '검색 결과가 없습니다.' : '즐겨찾기한 프로젝트가 없습니다.'}
                        </p>
                    )}
                </div>
            </section>

            <section className="mb-10">
                <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center">
                    <Users className="w-5 h-5 mr-2 text-[#B95D69]" />
                    내 프로젝트
                </h2>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-6">
                    {isProjectsLoading && (
                        <p className="text-sm text-gray-400">프로젝트를 불러오는 중입니다...</p>
                    )}
                    {myProjects.map((project) => (
                        <ProjectCard
                            key={project.id}
                            project={project}
                            onToggleFavorite={handleToggleFavorite}
                            onRequestJoin={handleRequestJoin}
                            isFavoriteUpdating={updatingFavoriteProjectId === project.id}
                            isJoinRequesting={requestingJoinProjectId === project.id}
                            canToggleFavorite={isAuthenticated}
                            canRequestJoin={false}
                        />
                    ))}
                    {myProjects.length === 0 && !isProjectsLoading && !isProjectsLoadError && (
                        <p className="text-sm text-gray-400">
                            {hasSearchKeyword ? '검색 결과가 없습니다.' : '참여 중인 프로젝트가 없습니다.'}
                        </p>
                    )}
                </div>
            </section>

            <section className="mb-20">
                <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center">
                    <Briefcase className="w-5 h-5 mr-2 text-gray-500" />
                    전체 프로젝트 (All Projects)
                </h2>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-6">
                    {allProjectsViewState === 'loading' && (
                        <p className="text-sm text-gray-400">프로젝트를 불러오는 중입니다...</p>
                    )}
                    {allProjectsViewState === 'error' && (
                        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-500">
                            {projectsLoadErrorMessage}
                        </div>
                    )}
                    {allProjectsViewState === 'empty' && (
                        <p className="text-sm text-gray-400">
                            {hasSearchKeyword ? '검색 조건에 맞는 프로젝트가 없습니다.' : '현재 프로젝트가 존재하지 않습니다.'}
                        </p>
                    )}
                    {allProjectsViewState === 'ready' && allProjects.map((project) => (
                        <ProjectCard
                            key={project.id}
                            project={project}
                            onToggleFavorite={handleToggleFavorite}
                            onRequestJoin={handleRequestJoin}
                            isFavoriteUpdating={updatingFavoriteProjectId === project.id}
                            isJoinRequesting={requestingJoinProjectId === project.id}
                            canToggleFavorite={isAuthenticated}
                            canRequestJoin={isMembershipLoaded && !myMembershipProjectIdSet.has(project.id)}
                        />
                    ))}
                </div>
            </section>

            <button
                onClick={openCreateProject}
                className="md:hidden fixed bottom-6 right-6 w-14 h-14 bg-[#B95D69] hover:bg-[#A04C58] text-white rounded-full shadow-lg flex items-center justify-center transition-transform hover:scale-105 active:scale-95 z-40 cursor-pointer"
                aria-label="Create New Project"
            >
                <Plus className="w-8 h-8" />
            </button>
        </div>
    );
}
