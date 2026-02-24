'use client';

import React from 'react';
import { clsx } from 'clsx';
import { X } from 'lucide-react';

interface RightSidebarProps {
    isOpen: boolean;
    onClose?: () => void;
}

export const RightSidebar: React.FC<RightSidebarProps> = ({ isOpen, onClose }) => {
    return (
        <div
            className={clsx(
                "fixed right-0 top-16 bottom-0 bg-white border-l transition-all duration-300 z-40 flex flex-col shadow-sm",
                isOpen ? "w-80 translate-x-0" : "w-0 translate-x-full",
                isOpen ? "pointer-events-auto" : "pointer-events-none"
            )}
        >
            <div className="p-4 border-b flex items-center justify-between">
                <h3 className="font-semibold text-gray-800">채팅</h3>
                <button
                    type="button"
                    onClick={onClose}
                    className="md:hidden p-2 rounded-full hover:bg-gray-100 text-gray-500"
                    aria-label="Close chat"
                >
                    <X className="w-4 h-4" />
                </button>
                <span className="text-xs bg-gray-100 px-2 py-1 rounded-full text-gray-600">3개 신규</span>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
                {/* Mock Chat List */}
                {[1, 2, 3].map((i) => (
                    <div key={i} className="flex items-start space-x-3 mb-4 p-2 hover:bg-gray-50 rounded-lg cursor-pointer">
                        <div className="w-8 h-8 rounded-full bg-gray-200 shrink-0" />
                        <div className="overflow-hidden">
                            <div className="flex items-center justify-between">
                                <span className="text-sm font-medium text-gray-900">디자인 팀</span>
                                <span className="text-xs text-gray-400">오전 10:30</span>
                            </div>
                            <p className="text-xs text-gray-500 truncate mt-1">
                                새로운 와이어프레임 확인 부탁드립니다...
                            </p>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
