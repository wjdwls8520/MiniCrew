'use client';

import React from 'react';
import {
    LayoutDashboard,
    Plus,
    Star,
    ChevronDown,
    Settings,
    LogOut,
    LogIn,
} from 'lucide-react';
import Link from 'next/link';
import { clsx } from 'clsx';
import { useUI } from '@/context/UIContext';
import { useAuth } from '@/context/AuthContext';
import { usePathname } from 'next/navigation';
import { useRouter } from 'next/navigation';

interface LeftSidebarProps {
    isOpen: boolean;
    onToggle: () => void;
    onSettingsClick: () => void;
}

export const LeftSidebar: React.FC<LeftSidebarProps> = ({ isOpen, onToggle, onSettingsClick }) => {
    const { openCreateProjectModal, projects, isProjectsLoading, projectsError } = useUI();
    const { isAuthenticated, signOut } = useAuth();
    const router = useRouter();
    const pathname = usePathname();
    const isDashboardPage = pathname === '/dashboard' || pathname.startsWith('/dashboard');
    const isProjectPage = pathname?.startsWith('/project/');

    const visibleProjects = projects.slice(0, 12);
    const isProjectsLoadError = Boolean(projectsError);
    const projectsLoadErrorText = `[error] ${projectsError ?? '프로젝트 목록을 불러오지 못했습니다.'}`;
    const projectListViewState: 'loading' | 'error' | 'empty' | 'ready' = isProjectsLoading
        ? 'loading'
        : isProjectsLoadError
            ? 'error'
            : visibleProjects.length === 0
                ? 'empty'
                : 'ready';

    const handleSettings = () => {
        onSettingsClick();
    };

    const handleAuthAction = async () => {
        if (!isAuthenticated) {
            router.push('/login');
            return;
        }

        const confirmLogout = window.confirm('로그아웃 하시겠습니까?');
        if (!confirmLogout) {
            return;
        }

        try {
            await signOut();
            router.push('/dashboard');
        } catch {
            window.alert('로그아웃에 실패했습니다.');
        }
    };

    const handleCreateProject = () => {
        if (!isAuthenticated) {
            router.push('/login');
            return;
        }

        openCreateProjectModal();
    };

    return (
        <>
            {/* Mobile Backdrop */}
            <div
                className={clsx(
                    "fixed inset-0 bg-black/20 z-40 md:hidden transition-opacity duration-300 cursor-pointer",
                    isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
                )}
                onClick={onToggle}
                aria-hidden="true"
            />

            <div
                className={clsx(
                    "fixed left-0 top-16 bottom-0 bg-[#FFF8F9] border-r border-[#EED7DB] transition-all duration-300 z-50 flex flex-col",
                    // Mobile: full sidebar width if open, hidden if closed (off-canvas)
                    // Desktop: width 64 if open, width 16 if closed
                    isOpen ? "translate-x-0 w-64" : "-translate-x-full w-64 md:translate-x-0 md:w-[calc(var(--spacing)*18)]"
                )}
            >

                {/* Scrollable Content */}
                <div className="flex-1 overflow-y-auto px-2 pb-4 pt-4 scrollbar-hide">

                    {/* Create Project Button - Moved to Top */}
                    <div className="mb-4 w-full">
                        <button
                            onClick={handleCreateProject}
                            className={clsx(
                                "flex items-center bg-gradient-to-r from-[#B95D69] to-[#E08D79] hover:from-[#A04C58] hover:to-[#C67B6B] text-white rounded-xl transition-all shadow-md hover:shadow-lg h-12 w-full overflow-hidden cursor-pointer",
                            )}
                        >
                            <div className="w-12 flex-shrink-0 flex items-center justify-center h-full">
                                <Plus className="w-6 h-6 min-w-6" />
                            </div>
                            <span className={clsx("font-bold text-sm whitespace-nowrap", isOpen ? "opacity-100" : "opacity-0 hidden")}>
                                프로젝트 생성
                            </span>
                        </button>
                    </div>

                    {/* Dashboard Link */}
                    <div className="mb-4">
                        <Link
                            href="/dashboard"
                            className={clsx(
                                "flex items-center rounded-xl text-[#5E4246] h-10 transition-colors overflow-hidden border",
                                isDashboardPage
                                    ? "bg-[#FCEBF0] border-[#EED7DB]"
                                    : "hover:bg-[#FCEBF0] border-transparent"
                            )}
                            title={!isOpen ? "대시보드" : undefined}
                        >
                            <div className="w-12 flex-shrink-0 flex items-center justify-center h-full">
                                <LayoutDashboard className={clsx("w-5 h-5 min-w-5", isDashboardPage ? "text-[#A04C58]" : "text-[#B95D69]")} />
                            </div>
                            <span className={clsx("font-medium text-sm whitespace-nowrap", isOpen ? "opacity-100" : "opacity-0 hidden", isDashboardPage && "text-[#8E4C56]")}>
                                대시보드
                            </span>
                        </Link>
                    </div>

                    {/* Project List Section */}
                    <div>
                        {/* Header */}
                        <div className={clsx(
                            "flex items-center justify-between text-xs font-semibold text-[#A8646E] mb-2 px-3 uppercase tracking-wide whitespace-nowrap overflow-hidden h-6",
                            isOpen ? "opacity-100" : "opacity-0 invisible"
                        )}>
                            <span>내 프로젝트</span>
                            <ChevronDown className="w-3 h-3" />
                        </div>

                        <div className="space-y-1">
                            {isOpen && projectListViewState === 'loading' && (
                                <p className="px-3 py-2 text-xs text-[#A8646E]">불러오는 중...</p>
                            )}
                            {isOpen && projectListViewState === 'error' && (
                                <div className="mx-2 rounded-md border border-red-200 bg-red-50 px-2 py-1.5">
                                    <p className="text-xs text-red-500 leading-relaxed">{projectsLoadErrorText}</p>
                                </div>
                            )}
                            {isOpen && projectListViewState === 'empty' && (
                                <p className="px-3 py-2 text-xs text-[#A8646E]">현재 프로젝트가 존재하지 않습니다.</p>
                            )}
                            {projectListViewState === 'ready' && visibleProjects.map((p) => {
                                const isActiveProject = pathname === `/project/${p.id}` || isProjectPage && pathname.startsWith(`/project/${p.id}/`);

                                return (
                                    <Link
                                        key={p.id}
                                        href={`/project/${p.id}`}
                                        className={clsx(
                                            'flex items-center rounded-md transition-colors overflow-hidden h-10',
                                            isActiveProject
                                                ? 'bg-[#FCEBF0] text-[#8E4C56] border border-[#EED7DB]'
                                                : 'hover:bg-[#FCEBF0] group text-[#5E4246] border border-transparent'
                                        )}
                                        title={!isOpen ? p.name : undefined}
                                    >
                                        <div className="w-12 flex-shrink-0 flex items-center justify-center h-full">
                                            <div className={clsx("w-5 h-5 rounded bg-[#FFE4E8] text-[#B95D69] flex items-center justify-center text-xs font-bold", isActiveProject && "ring-1 ring-[#B95D69]")}>
                                                {p.name.substring(0, 1)}
                                            </div>
                                        </div>

                                        <div className={clsx("flex items-center overflow-hidden flex-1 pr-2", isOpen ? "block" : "hidden")}>
                                            <span className="text-sm truncate flex-1 whitespace-nowrap">{p.name}</span>
                                            {p.isFavorite && <Star className="w-3 h-3 text-[#e4e4a7] fill-[#faf95d] ml-2 shrink-0" />}
                                        </div>
                                    </Link>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Footer: Settings & Logout */}
            <div className="p-2 border-t border-[#EED7DB] mt-auto">
                    <button
                        className="flex items-center rounded-md hover:bg-[#FCEBF0] text-[#5E4246] h-10 transition-colors overflow-hidden w-full"
                        onClick={handleSettings}
                        title={!isOpen ? "설정" : undefined}
                    >
                        <div className="w-12 flex-shrink-0 flex items-center justify-center h-full">
                            <Settings className="w-5 h-5 min-w-5 text-[#B95D69]" />
                        </div>
                        <span className={clsx("font-medium text-sm whitespace-nowrap", isOpen ? "opacity-100" : "opacity-0 hidden")}>
                            설정
                        </span>
                    </button>
                    <button
                        className="flex items-center rounded-md hover:bg-[#FCEBF0] text-[#5E4246] h-10 transition-colors overflow-hidden w-full mt-1"
                        onClick={handleAuthAction}
                        title={!isOpen ? (isAuthenticated ? '로그아웃' : '로그인') : undefined}
                    >
                        <div className="w-12 flex-shrink-0 flex items-center justify-center h-full">
                            {isAuthenticated ? (
                                <LogOut className="w-5 h-5 min-w-5 text-[#B95D69]" />
                            ) : (
                                <LogIn className="w-5 h-5 min-w-5 text-[#B95D69]" />
                            )}
                        </div>
                        <span className={clsx("font-medium text-sm whitespace-nowrap", isOpen ? "opacity-100" : "opacity-0 hidden")}>
                            {isAuthenticated ? '로그아웃' : '로그인'}
                        </span>
                    </button>
                </div>
            </div>
        </>
    );
};
