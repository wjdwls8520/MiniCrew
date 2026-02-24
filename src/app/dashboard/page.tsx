'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Star, Users, Briefcase, Calendar, Plus } from 'lucide-react';
import { useUI } from '@/context/UIContext';
import { toErrorMessage } from '@/lib/api/errors';
import type { ProjectItem } from '@/types/project';

interface ProjectCardProps {
    project: ProjectItem;
    onToggleFavorite: (project: ProjectItem) => Promise<void>;
    isFavoriteUpdating: boolean;
}

const ProjectCard = ({ project, onToggleFavorite, isFavoriteUpdating }: ProjectCardProps) => {
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
                <button
                    type="button"
                    disabled={isFavoriteUpdating}
                    onClick={async (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        await onToggleFavorite(project);
                    }}
                    className="p-1 rounded-full hover:bg-white/70 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    aria-label={project.isFavorite ? '즐겨찾기 해제' : '즐겨찾기 추가'}
                    title={project.isFavorite ? '즐겨찾기 해제' : '즐겨찾기 추가'}
                >
                    <Star
                        className={project.isFavorite ? 'w-4 h-4 text-yellow-400 fill-yellow-400' : 'w-4 h-4 text-gray-300'}
                    />
                </button>
            </div>

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
    const [updatingFavoriteProjectId, setUpdatingFavoriteProjectId] = useState<string | null>(null);

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

    const myProjects = filteredProjects.filter((project) => project.isFavorite);
    const allProjects = filteredProjects;

    const handleToggleFavorite = async (project: ProjectItem) => {
        if (updatingFavoriteProjectId) {
            return;
        }

        try {
            setUpdatingFavoriteProjectId(project.id);
            await toggleProjectFavorite(project.id, !project.isFavorite);
        } catch (error) {
            alert(toErrorMessage(error, '즐겨찾기 상태를 변경하지 못했습니다.'));
        } finally {
            setUpdatingFavoriteProjectId(null);
        }
    };

    return (
        <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8 relative min-h-screen">
            <div className="flex items-center justify-between mb-8 gap-4 flex-wrap">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
                    <p className="text-sm text-gray-500 mt-1">오늘의 업무 현황을 한눈에 확인하세요.</p>
                </div>
                <button
                    onClick={openCreateProjectModal}
                    className="hidden md:inline-flex px-4 py-2 bg-[#B95D69] hover:bg-[#A04C58] text-white rounded-md text-sm font-medium transition-colors shadow-sm items-center cursor-pointer"
                >
                    <Plus className="w-4 h-4 mr-2" />
                    새 프로젝트
                </button>
            </div>

            <section className="mb-10">
                <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center">
                    <Star className="w-5 h-5 mr-2 text-yellow-400 fill-yellow-400" />
                    내 프로젝트 (My Projects)
                </h2>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-6">
                    {isProjectsLoading && (
                        <p className="text-sm text-gray-400">프로젝트를 불러오는 중입니다...</p>
                    )}
                    {projectsError && !isProjectsLoading && (
                        <p className="text-sm text-red-400">{projectsError}</p>
                    )}
                    {myProjects.map((project) => (
                        <ProjectCard
                            key={project.id}
                            project={project}
                            onToggleFavorite={handleToggleFavorite}
                            isFavoriteUpdating={updatingFavoriteProjectId === project.id}
                        />
                    ))}
                    {myProjects.length === 0 && !isProjectsLoading && !projectsError && (
                        <p className="text-sm text-gray-400">
                            {searchKeyword.trim() ? '검색 결과가 없습니다.' : '즐겨찾기한 프로젝트가 없습니다.'}
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
                    {allProjects.map((project) => (
                        <ProjectCard
                            key={project.id}
                            project={project}
                            onToggleFavorite={handleToggleFavorite}
                            isFavoriteUpdating={updatingFavoriteProjectId === project.id}
                        />
                    ))}
                    {allProjects.length === 0 && !isProjectsLoading && !projectsError && (
                        <p className="text-sm text-gray-400">검색 조건에 맞는 프로젝트가 없습니다.</p>
                    )}
                </div>
            </section>

            <button
                onClick={openCreateProjectModal}
                className="md:hidden fixed bottom-6 right-6 w-14 h-14 bg-[#B95D69] hover:bg-[#A04C58] text-white rounded-full shadow-lg flex items-center justify-center transition-transform hover:scale-105 active:scale-95 z-40 cursor-pointer"
                aria-label="Create New Project"
            >
                <Plus className="w-8 h-8" />
            </button>
        </div>
    );
}
