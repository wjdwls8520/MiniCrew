'use client';

import React, { useState } from 'react';
import { Star, Info } from 'lucide-react';
import { ProjectDescriptionModal } from './ProjectDescriptionModal';

interface ProjectHeaderProps {
    project: {
        id: string;
        name: string;
        description: string;
        category: string;
        themeColor: string;
        isFavorite: boolean;
    };
    onToggleFavorite?: () => Promise<void> | void;
    isFavoriteUpdating?: boolean;
}

export function ProjectHeader({ project, onToggleFavorite, isFavoriteUpdating = false }: ProjectHeaderProps) {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const canToggleFavorite = typeof onToggleFavorite === 'function';

    return (
        <header className="mb-6">
            {/* Category Breadcrumb / Mal-meori */}
            <div className="flex items-center text-sm font-medium mb-1">
                <span
                    className="px-2 py-0.5 rounded text-xs"
                    style={{
                        backgroundColor: `${project.themeColor}20`, // 12% opacity
                        color: project.themeColor
                    }}
                >
                    {project.category}
                </span>
            </div>

            {/* Title Row */}
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center">
                    <h1 className="text-2xl font-bold text-gray-900 mr-2">
                        {project.name}
                    </h1>
                    {!canToggleFavorite && project.isFavorite && (
                        <Star className="w-5 h-5 text-yellow-400 fill-yellow-400" />
                    )}
                </div>
                <div className="flex items-center space-x-2">
                    {canToggleFavorite && (
                        <button
                            type="button"
                            onClick={onToggleFavorite}
                            disabled={isFavoriteUpdating}
                            className="p-2 rounded-full hover:bg-gray-100 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                            aria-label={project.isFavorite ? '즐겨찾기 해제' : '즐겨찾기 추가'}
                            title={project.isFavorite ? '즐겨찾기 해제' : '즐겨찾기 추가'}
                        >
                            <Star
                                className={project.isFavorite ? 'w-5 h-5 text-yellow-400 fill-yellow-400' : 'w-5 h-5 text-gray-300'}
                            />
                        </button>
                    )}
                </div>
            </div>

            {/* Description Row (Truncated) */}
            <div className="flex items-start">
                <p className="text-gray-500 text-sm line-clamp-1 flex-1 pr-2">
                    {project.description}
                </p>
                <button
                    onClick={() => setIsModalOpen(true)}
                    className="p-1 -mt-1 rounded-full hover:bg-gray-100 text-gray-400 transition-colors flex-shrink-0 cursor-pointer"
                    aria-label="View Project Details"
                    title="자세히 보기"
                >
                    <Info className="w-4 h-4" />
                </button>
            </div>

            {/* Detail Modal */}
            <ProjectDescriptionModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                title={project.name}
                description={project.description}
                themeColor={project.themeColor}
            />
        </header>
    );
}
