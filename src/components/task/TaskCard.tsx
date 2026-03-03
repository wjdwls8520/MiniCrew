import React from 'react';
import { Clock, MessageSquare, PencilLine, FileImage, FileText, FileArchive, File } from 'lucide-react';
import { clsx } from 'clsx';
import { STATUS_COLORS, STATUS_LABELS } from '@/constants/project';
import type { Task } from '@/types/workflow';

export type { Task, TaskPriority, TaskStatus } from '@/types/workflow';

export interface TaskCardProps {
    task: Task;
    themeColor: string;
    onDetail?: () => void;
    onDelete?: () => void;
    onEdit?: () => void;
}

const PRIORITY_CONFIG = {
    URGENT: { label: '긴급', color: 'text-red-600 bg-red-50 border-red-100' },
    HIGH: { label: '높음', color: 'text-orange-600 bg-orange-50 border-orange-100' },
    NORMAL: { label: '보통', color: 'text-green-600 bg-green-50 border-green-100' },
    LOW: { label: '낮음', color: 'text-gray-600 bg-gray-50 border-gray-100' },
};

export function TaskCard({ task, themeColor, onDetail, onDelete, onEdit }: TaskCardProps) {
    const handleDelete = () => {
        onDelete?.();
    };

    const priorityConfig = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.NORMAL;
    const statusColor = STATUS_COLORS[task.status] || STATUS_COLORS.REQUEST;
    const statusLabel = STATUS_LABELS[task.status] || task.status;
    const getAttachmentIcon = (mimeType?: string | null) => {
        const mime = (mimeType ?? '').toLowerCase();
        if (mime.startsWith('image/')) {
            return <FileImage className="h-4 w-4 text-sky-500" />;
        }
        if (mime.includes('zip') || mime.includes('compressed') || mime.includes('archive')) {
            return <FileArchive className="h-4 w-4 text-amber-500" />;
        }
        if (mime.startsWith('text/') || mime.includes('pdf') || mime.includes('word') || mime.includes('spreadsheet')) {
            return <FileText className="h-4 w-4 text-gray-500" />;
        }
        return <File className="h-4 w-4 text-gray-500" />;
    };

    return (
        <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm transition-all group relative hover:border-gray-300">
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
                {task.imageUrl && (
                    <a
                        href={task.imageUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-3 block overflow-hidden rounded-lg border border-gray-200"
                    >
                        <img
                            src={task.imageUrl}
                            alt={task.imageOriginalFilename || '업무 첨부 이미지'}
                            className="max-h-64 w-full object-cover"
                        />
                    </a>
                )}
                {task.attachments.length > 0 && (
                    <div className="mt-3 space-y-2">
                        {task.attachments.map((attachment) => (
                            <a
                                key={attachment.id || attachment.storagePath}
                                href={attachment.fileUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center gap-2 rounded-lg border border-gray-200 px-2.5 py-2 hover:bg-gray-50"
                            >
                                {attachment.mimeType.startsWith('image/') ? (
                                    <span className="h-10 w-10 overflow-hidden rounded border border-gray-200">
                                        <img
                                            src={attachment.fileUrl}
                                            alt={attachment.originalFilename}
                                            className="h-full w-full object-cover"
                                        />
                                    </span>
                                ) : (
                                    <span className="inline-flex h-10 w-10 items-center justify-center rounded border border-gray-200 bg-gray-50">
                                        {getAttachmentIcon(attachment.mimeType)}
                                    </span>
                                )}
                                <span className="min-w-0 flex-1 truncate text-xs text-gray-700">
                                    {attachment.originalFilename}
                                </span>
                            </a>
                        ))}
                    </div>
                )}
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
            {(onDetail || onDelete || onEdit) && (
                <div className="mt-3 flex gap-2 justify-end">
                    {onDetail && (
                        <button
                            type="button"
                            onClick={onDetail}
                            className="text-xs text-gray-600 border border-gray-200 hover:bg-gray-50 rounded-md px-2 py-1"
                        >
                            상세 보기
                        </button>
                    )}
                    {onEdit && (
                        <button
                            type="button"
                            onClick={onEdit}
                            className="text-xs text-gray-600 border border-gray-200 hover:bg-gray-50 rounded-md px-2 py-1"
                        >
                            <span className="inline-flex items-center gap-1">
                                <PencilLine className="w-3 h-3" />
                                수정
                            </span>
                        </button>
                    )}
                    {onDelete && (
                        <button
                            type="button"
                            onClick={handleDelete}
                            className="text-xs text-red-500 border border-red-100 hover:bg-red-50 rounded-md px-2 py-1"
                        >
                            삭제
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
