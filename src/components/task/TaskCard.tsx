import React from 'react';
import { Clock, MessageSquare } from 'lucide-react';
import { clsx } from 'clsx';
import { STATUS_COLORS, STATUS_LABELS } from '@/constants/project';
import type { Task } from '@/types/workflow';

export type { Task, TaskPriority, TaskStatus } from '@/types/workflow';

export interface TaskCardProps {
    task: Task;
    themeColor: string;
    onClick?: () => void;
}

const PRIORITY_CONFIG = {
    URGENT: { label: '긴급', color: 'text-red-600 bg-red-50 border-red-100' },
    HIGH: { label: '높음', color: 'text-orange-600 bg-orange-50 border-orange-100' },
    NORMAL: { label: '보통', color: 'text-green-600 bg-green-50 border-green-100' },
    LOW: { label: '낮음', color: 'text-gray-600 bg-gray-50 border-gray-100' },
};

export function TaskCard({ task, themeColor, onClick }: TaskCardProps) {
    const priorityConfig = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.NORMAL;
    const statusColor = STATUS_COLORS[task.status] || STATUS_COLORS.REQUEST;
    const statusLabel = STATUS_LABELS[task.status] || task.status;

    return (
        <div
            onClick={onClick}
            className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm transition-all cursor-pointer group relative hover:border-gray-300"
        >
            {/* Header: Author & Date */}
            <div className="flex justify-between items-start mb-3">
                <div className="flex items-center space-x-2">
                    <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-bold text-gray-500">
                        {task.author.name[0]}
                    </div>
                    <div>
                        <p className="text-sm font-semibold text-gray-900">{task.author.name}</p>
                        <p className="text-xs text-gray-400">{task.createdAt}</p>
                    </div>
                </div>
                {/* Status Badge (replacing More menu or added next to it) */}
                <div className="flex items-center space-x-2">
                    <span
                        className="px-3 py-1 rounded-full text-xs font-medium text-white shadow-sm"
                        style={{ backgroundColor: statusColor }}
                    >
                        {statusLabel}
                    </span>
                </div>
            </div>

            {/* Title & Content */}
            <div className="mb-4">
                <h3 className="text-base font-bold text-gray-900 mb-1 line-clamp-1 group-hover:text-opacity-80 transition-colors">
                    {task.title}
                </h3>
                <p className="text-sm text-gray-500 line-clamp-2">
                    {task.content}
                </p>
            </div>

            {/* Meta Info: Priority & Date */}
            <div className="flex items-center gap-2 mb-4">
                <span className={clsx("px-2 py-0.5 rounded text-xs font-medium border", priorityConfig.color)}>
                    {priorityConfig.label}
                </span>

                {task.endDate && (
                    <div className="flex items-center text-xs text-gray-400 bg-gray-50 px-2 py-0.5 rounded border border-gray-100">
                        <Clock className="w-3 h-3 mr-1" />
                        {task.endDate}
                    </div>
                )}
            </div>

            {/* Progress Bar */}
            <div className="mb-4">
                <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-500 font-medium">진행률</span>
                    <span className="font-bold" style={{ color: themeColor }}>{task.progress}%</span>
                </div>
                <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${task.progress}%`, backgroundColor: themeColor }}
                    />
                </div>
            </div>

            {/* Footer: Assignees & Comments */}
            <div className="flex justify-between items-center border-t border-gray-50 pt-3">
                {/* Assignees */}
                <div className="flex -space-x-2">
                    {task.assignees.map((user, i) => (
                        <div
                            key={user.id}
                            className="w-6 h-6 rounded-full border-2 border-white bg-gray-100 flex items-center justify-center text-[10px] text-gray-500 font-medium"
                            title={user.name}
                            style={{ zIndex: 10 - i }}
                        >
                            {user.name[0]}
                        </div>
                    ))}
                    {task.assignees.length === 0 && (
                        <span className="text-xs text-gray-400">담당자 미지정</span>
                    )}
                </div>

                {/* Comments */}
                <div className="flex items-center text-gray-400 text-xs">
                    <MessageSquare className="w-3.5 h-3.5 mr-1" />
                    <span>{task.commentCount}</span>
                </div>
            </div>
        </div>
    );
}
