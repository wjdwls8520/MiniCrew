'use client';

import React, { useState } from 'react';
import { Header } from '@/components/layout/Header';
import { LeftSidebar } from '@/components/layout/LeftSidebar';
import { RightSidebar } from '@/components/layout/RightSidebar';
import { clsx } from 'clsx';
import { CreateProjectModal } from '@/components/modals/CreateProjectModal';
import { UIProvider } from '@/context/UIContext';
import { AuthProvider } from '@/context/AuthContext';

export default function MainLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <AuthProvider>
            <UIProvider>
                <MainLayoutContent>{children}</MainLayoutContent>
            </UIProvider>
        </AuthProvider>
    );
}

function MainLayoutContent({ children }: { children: React.ReactNode }) {
    const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(true);
    const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(false);

    return (
        <div className="min-h-screen bg-white">
            <Header
                onMenuToggle={() => setIsLeftSidebarOpen(!isLeftSidebarOpen)}
                onChatToggle={() => setIsRightSidebarOpen(!isRightSidebarOpen)}
                isChatOpen={isRightSidebarOpen}
                isSidebarOpen={isLeftSidebarOpen}
            />

            <LeftSidebar
                isOpen={isLeftSidebarOpen}
                onToggle={() => setIsLeftSidebarOpen(!isLeftSidebarOpen)}
            />

            {isRightSidebarOpen && (
                <div
                    className="fixed inset-0 bg-black/20 z-30 md:hidden"
                    onClick={() => setIsRightSidebarOpen(false)}
                    aria-hidden="true"
                />
            )}

            <RightSidebar
                isOpen={isRightSidebarOpen}
                onClose={() => setIsRightSidebarOpen(false)}
            />

            <main
                className={clsx(
                    "pt-16 transition-all duration-300 min-h-screen",
                    // Mobile: Always ml-0 (sidebar is overlay)
                    // Desktop: ml-64 or ml-16 based on sidebar
                    isLeftSidebarOpen ? "md:ml-64" : "md:ml-16",
                    isRightSidebarOpen ? "md:mr-80" : "md:mr-0"
                )}
            >
                <div className="p-4 md:p-6">
                    {children}
                </div>
            </main>

            <CreateProjectModal />
        </div>
    );
}
