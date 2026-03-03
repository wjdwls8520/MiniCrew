'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, ReactNode } from 'react';
import { createProject, listProjects, updateProjectFavorite } from '@/lib/api/projects';
import { useAuth } from '@/context/AuthContext';
import { toErrorMessage } from '@/lib/api/errors';
import { isAnomalyBlockedError } from '@/lib/api/client';
import type { CreateProjectInput, ProjectCreatorIdentity, ProjectItem } from '@/types/project';

interface UIContextType {
    isCreateProjectModalOpen: boolean;
    openCreateProjectModal: () => void;
    closeCreateProjectModal: () => void;
    projects: ProjectItem[];
    isProjectsLoading: boolean;
    projectsError: string | null;
    refreshProjects: () => Promise<void>;
    addProject: (project: CreateProjectInput, createdBy: ProjectCreatorIdentity) => Promise<ProjectItem>;
    toggleProjectFavorite: (projectId: string, nextFavorite: boolean) => Promise<ProjectItem>;
    searchKeyword: string;
    setSearchKeyword: (keyword: string) => void;
}

const UIContext = createContext<UIContextType | undefined>(undefined);

export function UIProvider({ children }: { children: ReactNode }) {
    const { user, profile, isAuthenticated, isOnboarded } = useAuth();
    const [projects, setProjects] = useState<ProjectItem[]>([]);
    const [isProjectsLoading, setIsProjectsLoading] = useState(true);
    const [projectsError, setProjectsError] = useState<string | null>(null);
    const [isCreateProjectModalOpen, setIsCreateProjectModalOpen] = useState(false);
    const [searchKeyword, setSearchKeyword] = useState('');
    const refreshProjectsDebounceTimerRef = useRef<number | null>(null);

    const membershipView = useMemo(() => ({
        userId: user?.id,
        email: profile?.email ?? user?.email,
    }), [user?.id, profile?.email, user?.email]);

    const refreshProjects = useCallback(async () => {
        if (!isAuthenticated || !isOnboarded) {
            setProjects([]);
            setProjectsError(null);
            setIsProjectsLoading(false);
            return;
        }

        setIsProjectsLoading(true);
        setProjectsError(null);

        try {
            const nextProjects = await listProjects(membershipView);
            setProjects(nextProjects);
        } catch (error) {
            if (isAnomalyBlockedError(error)) {
                setProjectsError(null);
                return;
            }
            setProjectsError(toErrorMessage(error, '프로젝트 목록을 불러오지 못했습니다.'));
        } finally {
            setIsProjectsLoading(false);
        }
    }, [isAuthenticated, isOnboarded, membershipView]);

    const membershipKey = `${membershipView.userId ?? ''}|${membershipView.email ?? ''}`;

    useEffect(() => {
        if (refreshProjectsDebounceTimerRef.current !== null) {
            window.clearTimeout(refreshProjectsDebounceTimerRef.current);
            refreshProjectsDebounceTimerRef.current = null;
        }

        refreshProjectsDebounceTimerRef.current = window.setTimeout(() => {
            refreshProjectsDebounceTimerRef.current = null;
            void refreshProjects();
        }, 220);

        return () => {
            if (refreshProjectsDebounceTimerRef.current !== null) {
                window.clearTimeout(refreshProjectsDebounceTimerRef.current);
                refreshProjectsDebounceTimerRef.current = null;
            }
        };
    }, [membershipKey, refreshProjects]);

    const openCreateProjectModal = useCallback(() => setIsCreateProjectModalOpen(true), []);
    const closeCreateProjectModal = useCallback(() => setIsCreateProjectModalOpen(false), []);

    const addProject = useCallback(async (project: CreateProjectInput, createdBy: ProjectCreatorIdentity) => {
        const createdProject = await createProject(project, createdBy);
        setProjects((prev) => [createdProject, ...prev]);
        return createdProject;
    }, []);

    const toggleProjectFavorite = useCallback(async (projectId: string, nextFavorite: boolean) => {
        const updatedProject = await updateProjectFavorite(projectId, nextFavorite);
        setProjects((prev) => prev.map((project) => (
            project.id === projectId
                ? { ...project, isFavorite: updatedProject.isFavorite }
                : project
        )));
        return updatedProject;
    }, []);

    const value = useMemo(
        () => ({
            isCreateProjectModalOpen,
            openCreateProjectModal,
            closeCreateProjectModal,
            projects,
            isProjectsLoading,
            projectsError,
            refreshProjects,
            addProject,
            toggleProjectFavorite,
            searchKeyword,
            setSearchKeyword,
        }),
        [
            isCreateProjectModalOpen,
            openCreateProjectModal,
            closeCreateProjectModal,
            projects,
            isProjectsLoading,
            projectsError,
            refreshProjects,
            addProject,
            toggleProjectFavorite,
            searchKeyword,
        ]
    );

    return <UIContext.Provider value={value}>{children}</UIContext.Provider>;
}

export function useUI() {
    const context = useContext(UIContext);
    if (context === undefined) {
        throw new Error('`useUI`는 `UIProvider` 내부에서만 사용할 수 있습니다.');
    }
    return context;
}
