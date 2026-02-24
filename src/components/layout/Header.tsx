'use client';

import React from 'react';
import { Search, Bell, MessageSquare, Menu, UserRound, LogIn } from 'lucide-react';
import { useUI } from '@/context/UIContext';
import { useAuth } from '@/context/AuthContext';
import Link from 'next/link';

interface HeaderProps {
    onMenuToggle: () => void;
    onChatToggle: () => void;
    isChatOpen: boolean;
    isSidebarOpen: boolean;
}

export const Header: React.FC<HeaderProps> = ({ onMenuToggle, onChatToggle, isChatOpen, isSidebarOpen }) => {
    const { searchKeyword, setSearchKeyword } = useUI();
    const { isAuthenticated } = useAuth();

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
                <button className="p-2 hover:bg-[#FCEBF0] rounded-full relative transition-colors">
                    <Bell className="w-5 h-5 text-gray-600" />
                    <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border border-white"></span>
                </button>
                <button
                    onClick={onChatToggle}
                    className={`p-2 rounded-full transition-colors ${isChatOpen ? 'bg-[#FFF0F3] text-[#B95D69]' : 'hover:bg-[#FCEBF0] text-gray-600'}`}
                >
                    <MessageSquare className="w-5 h-5" />
                </button>
                <Link
                    href={isAuthenticated ? '/dashboard' : '/login'}
                    className="w-8 h-8 bg-[#FFE4E8] rounded-full flex items-center justify-center text-xs font-medium text-[#B95D69] cursor-pointer"
                    aria-label={isAuthenticated ? '로그인된 사용자 아이콘' : '로그인 페이지로 이동'}
                    title={isAuthenticated ? '프로필' : '로그인'}
                >
                    {isAuthenticated ? <UserRound className="w-4 h-4" /> : <LogIn className="w-4 h-4" />}
                </Link>
            </div>
        </header>
    );
};
