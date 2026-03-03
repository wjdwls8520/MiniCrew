'use client';

import React from 'react';
import { Search, Bell, MessageSquare, Menu, UsersRound } from 'lucide-react';
import { useUI } from '@/context/UIContext';
import { useAuth } from '@/context/AuthContext';
import { getProfileAvatarUrl } from '@/lib/profileAvatar';
import Link from 'next/link';

interface HeaderProps {
    onMenuToggle: () => void;
    onNotificationToggle: () => void;
    onAddressBookToggle: () => void;
    onChatToggle: () => void;
    onProfileToggle: () => void;
    isNotificationOpen: boolean;
    isAddressBookOpen: boolean;
    isChatOpen: boolean;
    isProfileOpen: boolean;
    isSidebarOpen: boolean;
    unreadNotificationCount: number;
    onlineMemberCount: number;
    unreadChatCount: number;
}

export const Header: React.FC<HeaderProps> = ({
    onMenuToggle,
    onNotificationToggle,
    onAddressBookToggle,
    onChatToggle,
    onProfileToggle,
    isNotificationOpen,
    isAddressBookOpen,
    isChatOpen,
    isProfileOpen,
    isSidebarOpen,
    unreadNotificationCount,
    onlineMemberCount,
    unreadChatCount,
}) => {
    const { searchKeyword, setSearchKeyword } = useUI();
    const { isAuthenticated, user, profile } = useAuth();
    const unreadText = unreadNotificationCount > 99 ? '99+' : String(unreadNotificationCount);
    const onlineMemberText = onlineMemberCount > 99 ? '99+' : String(onlineMemberCount);
    const unreadChatText = unreadChatCount > 99 ? '99+' : String(unreadChatCount);
    const userMetadata = (user?.user_metadata ?? {}) as Record<string, unknown>;
    const oauthAvatarUrl = (
        typeof userMetadata.avatar_url === 'string' ? userMetadata.avatar_url
            : typeof userMetadata.picture === 'string' ? userMetadata.picture
                : typeof userMetadata.profile_image_url === 'string' ? userMetadata.profile_image_url
                    : ''
    ).trim();
    const profileAvatarUrl = getProfileAvatarUrl(profile?.avatarUrl?.trim() || oauthAvatarUrl || null);

    return (
        <header className="h-16 border-b border-[#EED7DB] bg-[#FFF8F9] flex items-center justify-between pl-3.5 pr-4 fixed top-0 left-0 right-0 z-50">
            {/* Left: Logo area */}
            <div className="flex items-center w-64">
                <button
                    onClick={onMenuToggle}
                    className={`p-2 mr-2 rounded-md transition-colors cursor-pointer ${isSidebarOpen ? 'bg-[#FCEBF0] text-[#B95D69]' : 'hover:bg-[#FCEBF0] text-[#A8646E]'}`}
                >
                    <Menu className="w-5 h-5" />
                </button>
                <Link href="/dashboard" className="text-xl font-bold text-[#B95D69] cursor-pointer">
                    MiniCrew
                </Link>
            </div>

            {/* Middle: Search bar */}
            <div className="flex-1 max-w-xl mx-4 hidden md:block">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                        type="text"
                        value={searchKeyword}
                        onChange={(e) => setSearchKeyword(e.target.value)}
                        placeholder="업무나 프로젝트 검색..."
                        className="w-full pl-10 pr-4 py-2 bg-white rounded-md focus:outline-none focus:ring-2 focus:ring-[#B95D69] text-sm border border-[#EED7DB] text-gray-900 placeholder-gray-400"
                    />
                </div>
            </div>

            {/* Right: Icons */}
            <div className="flex items-center space-x-4">
                {!isAuthenticated ? (
                    <Link
                        href="/login"
                        className="px-3 h-9 rounded-lg border border-[#EED7DB] bg-white text-[#B95D69] font-semibold text-sm flex items-center hover:bg-[#FFF8F9] cursor-pointer"
                    >
                        로그인
                    </Link>
                ) : (
                    <>
                    <button
                        type="button"
                        onClick={onNotificationToggle}
                        className={`p-2 rounded-full relative transition-colors cursor-pointer ${isNotificationOpen ? 'bg-[#FFF0F3] text-[#B95D69]' : 'hover:bg-[#FCEBF0] text-gray-600'}`}
                    >
                        <Bell className="w-5 h-5" />
                        {unreadNotificationCount > 0 && (
                            <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-red-500 text-white text-[10px] leading-4 text-center border border-white font-semibold">
                                {unreadText}
                            </span>
                        )}
                    </button>
                    <button
                        type="button"
                        onClick={onAddressBookToggle}
                        className={`p-2 rounded-full relative transition-colors cursor-pointer ${isAddressBookOpen ? 'bg-[#FFF0F3] text-[#B95D69]' : 'hover:bg-[#FCEBF0] text-gray-600'}`}
                        aria-label="주소록"
                    >
                        <UsersRound className="w-5 h-5" />
                        {onlineMemberCount > 0 && (
                            <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-emerald-500 text-white text-[10px] leading-4 text-center border border-white font-semibold">
                                {onlineMemberText}
                            </span>
                        )}
                    </button>
                    <button
                        type="button"
                        onClick={onChatToggle}
                        className={`p-2 rounded-full relative transition-colors cursor-pointer ${isChatOpen ? 'bg-[#FFF0F3] text-[#B95D69]' : 'hover:bg-[#FCEBF0] text-gray-600'}`}
                        aria-label="메시지"
                    >
                        <MessageSquare className="w-5 h-5" />
                        {unreadChatCount > 0 && (
                            <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-red-500 text-white text-[10px] leading-4 text-center border border-white font-semibold">
                                {unreadChatText}
                            </span>
                        )}
                    </button>
                        <button
                            type="button"
                            onClick={onProfileToggle}
                            className={`h-8 w-8 overflow-hidden rounded-full border transition-all cursor-pointer ${isProfileOpen ? 'border-[#D28A99] ring-2 ring-[#F5CBD4]' : 'border-[#EED7DB] hover:ring-2 hover:ring-[#FCEBF0]'}`}
                            title="내 프로필"
                            aria-label="내 프로필"
                        >
                            <span
                                className="block h-full w-full bg-cover bg-center bg-no-repeat"
                                style={{ backgroundImage: `url("${profileAvatarUrl}")` }}
                                aria-hidden="true"
                            />
                        </button>
                    </>
                )}
            </div>
        </header>
    );
};
