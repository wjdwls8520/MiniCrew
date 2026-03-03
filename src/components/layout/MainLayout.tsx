'use client';

import React, { useEffect, useState } from 'react';
import { Header } from '@/components/layout/Header';
import { LeftSidebar } from '@/components/layout/LeftSidebar';
import { RightSidebar } from '@/components/layout/RightSidebar';
import { clsx } from 'clsx';
import { CreateProjectModal } from '@/components/modals/CreateProjectModal';
import { AppSettingsModal } from '@/components/modals/AppSettingsModal';
import { MyProfileModal } from '@/components/modals/MyProfileModal';
import { UIProvider } from '@/context/UIContext';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { usePathname, useRouter } from 'next/navigation';

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
    const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
    const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
    const [rightSidebarTab, setRightSidebarTab] = useState<'notifications' | 'address' | 'chat'>('chat');
    const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
    const [unreadChatCount, setUnreadChatCount] = useState(0);
    const [onlineMemberCount, setOnlineMemberCount] = useState(0);
    const { isAuthReady, isAuthenticated, isOnboarded } = useAuth();
    const router = useRouter();
    const pathname = usePathname();
    const canUseMemberFeatures = isAuthenticated && isOnboarded;

    useEffect(() => {
        if (!isAuthReady) {
            return;
        }
        if (!isAuthenticated || isOnboarded) {
            return;
        }
        if (pathname === '/auth/callback') {
            return;
        }

        router.replace('/auth/callback');
    }, [isAuthReady, isAuthenticated, isOnboarded, pathname, router]);

    const toggleRightSidebarTab = (tab: 'notifications' | 'address' | 'chat') => {
        if (isRightSidebarOpen && rightSidebarTab === tab) {
            setIsRightSidebarOpen(false);
            return;
        }

        setRightSidebarTab(tab);
        setIsRightSidebarOpen(true);
    };

    const requireAuthForSidebar = (tab: 'notifications' | 'address' | 'chat') => {
        if (!isAuthenticated) {
            router.replace('/login');
            return;
        }
        if (!isOnboarded) {
            router.replace('/auth/callback');
            return;
        }

        toggleRightSidebarTab(tab);
    };

    const openProfileModal = () => {
        if (!isAuthenticated) {
            router.replace('/login');
            return;
        }
        if (!isOnboarded) {
            router.replace('/auth/callback');
            return;
        }
        setIsProfileModalOpen(true);
    };

    return (
        <div className="min-h-screen bg-white">
            <Header
                onMenuToggle={() => setIsLeftSidebarOpen(!isLeftSidebarOpen)}
                onNotificationToggle={() => requireAuthForSidebar('notifications')}
                onAddressBookToggle={() => requireAuthForSidebar('address')}
                onChatToggle={() => requireAuthForSidebar('chat')}
                onProfileToggle={openProfileModal}
                isNotificationOpen={canUseMemberFeatures && isRightSidebarOpen && rightSidebarTab === 'notifications'}
                isAddressBookOpen={canUseMemberFeatures && isRightSidebarOpen && rightSidebarTab === 'address'}
                isChatOpen={canUseMemberFeatures && isRightSidebarOpen && rightSidebarTab === 'chat'}
                isProfileOpen={isProfileModalOpen}
                isSidebarOpen={isLeftSidebarOpen}
                unreadNotificationCount={unreadNotificationCount}
                onlineMemberCount={onlineMemberCount}
                unreadChatCount={unreadChatCount}
            />

            <LeftSidebar
                isOpen={isLeftSidebarOpen}
                onToggle={() => setIsLeftSidebarOpen(!isLeftSidebarOpen)}
                onSettingsClick={() => setIsSettingsModalOpen(true)}
            />

            {canUseMemberFeatures && isRightSidebarOpen && (
                <div
                    className="fixed inset-0 bg-black/20 z-30 md:hidden cursor-pointer"
                    onClick={() => setIsRightSidebarOpen(false)}
                    aria-hidden="true"
                />
            )}

            {canUseMemberFeatures && (
                <RightSidebar
                    isOpen={isRightSidebarOpen}
                    activeTab={rightSidebarTab}
                    onTabChange={setRightSidebarTab}
                    onUnreadCountChange={setUnreadNotificationCount}
                    onUnreadChatCountChange={setUnreadChatCount}
                    onOnlineMemberCountChange={setOnlineMemberCount}
                    onClose={() => setIsRightSidebarOpen(false)}
                />
            )}

            <main
                className={clsx(
                    "pt-16 transition-all duration-300 min-h-screen",
                    isLeftSidebarOpen ? "md:ml-64" : "md:ml-16",
                    canUseMemberFeatures && isRightSidebarOpen ? "md:mr-80" : "md:mr-0"
                )}
            >
                <div className="p-4 md:p-6">
                    {children}
                </div>
            </main>

            <CreateProjectModal />
            <AppSettingsModal
                isOpen={isSettingsModalOpen}
                onClose={() => setIsSettingsModalOpen(false)}
            />
            <MyProfileModal
                isOpen={isProfileModalOpen}
                onClose={() => setIsProfileModalOpen(false)}
            />
        </div>
    );
}
