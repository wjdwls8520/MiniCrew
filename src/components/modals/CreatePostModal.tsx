import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    X,
    Calendar,
    Users,
    Tag,
    Flag,
    Trash2,
    Paperclip,
    Eye,
    FileImage,
    FileText,
    FileArchive,
    File,
} from 'lucide-react';
import { clsx } from 'clsx';
import { toErrorMessage } from '@/lib/api/errors';
import { BOARD_IMAGE_MAX_BYTES, ITEM_ATTACHMENT_MAX_COUNT, ITEM_ATTACHMENT_NON_IMAGE_MAX_BYTES } from '@/lib/storage/imageUpload';
import type { CreateProjectItemInput, TaskAttachmentInput, TaskPriority, TaskStatus } from '@/types/workflow';

interface TabItem {
    id: string;
    label: string;
}

interface CreatePostModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (data: CreateProjectItemInput) => Promise<boolean | void> | boolean | void;
    statusTabs: TabItem[];
    categoryTabs: TabItem[];
    assigneeOptions?: { id: string; name: string; email?: string | null }[];
    isSubmitting?: boolean;
    mode?: 'CREATE' | 'EDIT';
    editItem?: {
        id: string;
        type: 'TASK' | 'POST';
        title: string;
        content: string;
        imageUrl?: string | null;
        imageOriginalFilename?: string | null;
        imageStoredFilename?: string | null;
        imageStoragePath?: string | null;
        imageSizeBytes?: number | null;
        attachments?: TaskAttachmentInput[];
        status?: TaskStatus;
        priority?: TaskPriority;
        assignees?: string[];
        startDate?: string;
        endDate?: string;
        category?: string;
    } | null;
}

interface FormState {
    title: string;
    content: string;
    status: TaskStatus;
    priority: TaskPriority;
    assignees: string[];
    startDate: string;
    endDate: string;
    category: string;
}

interface PendingTaskAttachment {
    key: string;
    file: File;
    previewUrl: string | null;
    isImageLike: boolean;
}

type TabType = 'TASK' | 'POST';

const PRIORITY_OPTIONS: { id: TaskPriority; label: string }[] = [
    { id: 'URGENT', label: '긴급' },
    { id: 'HIGH', label: '높음' },
    { id: 'NORMAL', label: '보통' },
    { id: 'LOW', label: '낮음' },
];

const TASK_STATUS_VALUES: TaskStatus[] = ['REQUEST', 'PROGRESS', 'FEEDBACK', 'REVIEW', 'DONE', 'HOLD', 'ISSUE'];
const HANGUL_BASE_CODE = 0xac00;
const HANGUL_LAST_CODE = 0xd7a3;
const HANGUL_INITIALS = [
    'ㄱ',
    'ㄲ',
    'ㄴ',
    'ㄷ',
    'ㄸ',
    'ㄹ',
    'ㅁ',
    'ㅂ',
    'ㅃ',
    'ㅅ',
    'ㅆ',
    'ㅇ',
    'ㅈ',
    'ㅉ',
    'ㅊ',
    'ㅋ',
    'ㅌ',
    'ㅍ',
    'ㅎ',
];

function toTaskStatus(status: string | undefined): TaskStatus {
    return TASK_STATUS_VALUES.includes(status as TaskStatus) ? (status as TaskStatus) : 'REQUEST';
}

function normalizeSearchKeyword(value: string): string {
    return value.trim().toLowerCase().replace(/\s+/g, '');
}

function extractHangulInitials(value: string): string {
    const chars: string[] = [];
    for (const letter of value) {
        const code = letter.charCodeAt(0);
        if (code >= HANGUL_BASE_CODE && code <= HANGUL_LAST_CODE) {
            const initialIndex = Math.floor((code - HANGUL_BASE_CODE) / 588);
            chars.push(HANGUL_INITIALS[initialIndex] ?? letter);
            continue;
        }
        chars.push(letter.toLowerCase());
    }
    return chars.join('');
}

function formatAssigneeLabel(assignee: { id: string; name: string; email?: string | null }): string {
    const name = assignee.name.trim() || '사용자';
    const email = assignee.email?.trim() || '이메일 없음';
    return `${name} - ${email}`;
}

function matchesAssigneeKeyword(keyword: string, assignee: { id: string; name: string; email?: string | null }): boolean {
    const normalizedKeyword = normalizeSearchKeyword(keyword);
    if (!normalizedKeyword) {
        return false;
    }

    const name = assignee.name.trim();
    const email = assignee.email?.trim() ?? '';

    const normalizedName = normalizeSearchKeyword(name);
    const normalizedEmail = normalizeSearchKeyword(email);
    if (normalizedName.includes(normalizedKeyword) || normalizedEmail.includes(normalizedKeyword)) {
        return true;
    }

    const initials = extractHangulInitials(name).replace(/\s+/g, '');
    return initials.includes(normalizedKeyword);
}

function isImageMime(mimeType?: string | null): boolean {
    return (mimeType ?? '').toLowerCase().startsWith('image/');
}

function isImageLikeFile(file: File): boolean {
    if (isImageMime(file.type)) {
        return true;
    }

    return /\.(avif|bmp|gif|heic|heif|jpe?g|png|svg|webp)$/i.test(file.name);
}

function formatFileSize(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes <= 0) {
        return '0KB';
    }
    if (bytes >= 1024 * 1024) {
        return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
    }
    return `${Math.max(1, Math.round(bytes / 1024))}KB`;
}

function getAttachmentIcon(mimeType?: string | null) {
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
}

export function CreatePostModal({
    isOpen,
    onClose,
    onSubmit,
    statusTabs,
    categoryTabs,
    assigneeOptions = [],
    isSubmitting = false,
    mode = 'CREATE',
    editItem = null,
}: CreatePostModalProps) {
    const isEditMode = mode === 'EDIT';
    const [activeTab, setActiveTab] = useState<TabType>('TASK');
    const [formData, setFormData] = useState<FormState>({
        title: '',
        content: '',
        status: 'REQUEST',
        priority: 'NORMAL',
        assignees: [],
        startDate: '',
        endDate: '',
        category: '',
    });

    const [taskRetainedAttachments, setTaskRetainedAttachments] = useState<TaskAttachmentInput[]>([]);
    const [taskNewAttachments, setTaskNewAttachments] = useState<PendingTaskAttachment[]>([]);
    const taskPreviewUrlSetRef = useRef<Set<string>>(new Set());
    const taskAttachmentInputRef = useRef<HTMLInputElement | null>(null);
    const initSessionKeyRef = useRef('');

    const [assigneeInput, setAssigneeInput] = useState('');
    const [isAssigneeInputFocused, setIsAssigneeInputFocused] = useState(false);
    const [isAssigneeComposing, setIsAssigneeComposing] = useState(false);

    const taskCategoryTabs = useMemo(
        () => categoryTabs.filter((tab) => tab.id !== 'ALL'),
        [categoryTabs]
    );
    const selectableCategoryTabs = taskCategoryTabs.length > 0 ? taskCategoryTabs : categoryTabs;

    const defaultCategory = selectableCategoryTabs[0]?.id ?? 'ALL';
    const defaultStatus = toTaskStatus(statusTabs[0]?.id);
    const defaultPriority = (editItem?.priority ?? 'NORMAL') as TaskPriority;

    useEffect(() => {
        if (!isOpen) {
            return;
        }

        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        return () => {
            document.body.style.overflow = previousOverflow;
        };
    }, [isOpen]);

    const clearAllTaskPreviews = () => {
        taskPreviewUrlSetRef.current.forEach((url) => {
            URL.revokeObjectURL(url);
        });
        taskPreviewUrlSetRef.current.clear();
    };

    useEffect(() => {
        if (!isOpen) {
            initSessionKeyRef.current = '';
            return;
        }

        const initKey = `${isEditMode ? 'edit' : 'create'}:${editItem?.id ?? 'new'}`;
        if (initSessionKeyRef.current === initKey) {
            return;
        }
        initSessionKeyRef.current = initKey;

        const timer = window.setTimeout(() => {
            const nextTab = isEditMode && editItem ? editItem.type : 'TASK';
            setActiveTab(nextTab);

            setFormData({
                title: editItem?.title ?? '',
                content: editItem?.content ?? '',
                status: editItem?.type === 'TASK' ? toTaskStatus(editItem.status) : defaultStatus,
                priority: editItem?.type === 'TASK' ? defaultPriority : 'NORMAL',
                assignees: editItem?.assignees ?? [],
                startDate: editItem?.startDate ?? '',
                endDate: editItem?.endDate ?? '',
                category: editItem?.category?.trim() || defaultCategory,
            });

            clearAllTaskPreviews();
            setTaskNewAttachments([]);
            setTaskRetainedAttachments(Array.isArray(editItem?.attachments) ? editItem.attachments : []);

            setAssigneeInput('');
            setIsAssigneeInputFocused(false);
            setIsAssigneeComposing(false);
        }, 0);

        return () => window.clearTimeout(timer);
    }, [isOpen, isEditMode, editItem, defaultCategory, defaultStatus, defaultPriority]);

    useEffect(() => {
        return () => {
            clearAllTaskPreviews();
        };
    }, []);

    const selectedAssignees = assigneeOptions.filter((assignee) => formData.assignees.includes(assignee.id));
    const filteredAssigneeCandidates = (() => {
        const query = normalizeSearchKeyword(assigneeInput);
        if (!query) {
            return [] as { id: string; name: string; email?: string | null }[];
        }

        const selectedAssigneeIdSet = new Set(formData.assignees);
        return assigneeOptions
            .filter((assignee) => {
                if (!assignee.id || selectedAssigneeIdSet.has(assignee.id)) {
                    return false;
                }
                return matchesAssigneeKeyword(query, assignee);
            })
            .slice(0, 12);
    })();
    const showAssigneeSuggestions = isAssigneeInputFocused && assigneeInput.trim().length > 0;
    const totalAttachmentCount = taskRetainedAttachments.length + taskNewAttachments.length;

    if (!isOpen) return null;

    const handleRemoveAssignee = (assigneeId: string) => {
        setFormData((prev) => ({
            ...prev,
            assignees: prev.assignees.filter((id) => id !== assigneeId),
        }));
    };

    const handleSelectAssignee = (assignee: { id: string; name: string; email?: string | null }) => {
        const isDuplicated = formData.assignees.includes(assignee.id);
        if (isDuplicated) {
            setAssigneeInput('');
            return;
        }

        setFormData((prev) => ({
            ...prev,
            assignees: [...prev.assignees, assignee.id],
        }));
        setAssigneeInput('');
    };

    const handleAssigneeInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        const nativeEvent = e.nativeEvent as KeyboardEvent & { isComposing?: boolean };

        if (isAssigneeComposing || nativeEvent.isComposing || e.key !== 'Enter') {
            return;
        }

        e.preventDefault();
        if (filteredAssigneeCandidates.length === 0) {
            alert('담당자는 목록에서 선택해 주세요.');
            return;
        }

        handleSelectAssignee(filteredAssigneeCandidates[0]);
    };

    const handleTaskAttachmentChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const fileList = event.target.files;
        if (!fileList || fileList.length === 0) {
            return;
        }

        // Array.from MUST happen before clearing the input value,
        // because FileList is a live reference that becomes empty after reset.
        const incomingFiles = Array.from(fileList);
        event.currentTarget.value = '';

        // Collect alerts to show AFTER state update (alert() blocks the thread
        // and must not run inside a React state updater).
        const pendingAlerts: string[] = [];

        setTaskNewAttachments((prev) => {
            const next = [...prev];
            const existingFileKeySet = new Set(
                next.map((entry) => `${entry.file.name}:${entry.file.size}:${entry.file.lastModified}`)
            );

            for (const file of incomingFiles) {
                const fileKey = `${file.name}:${file.size}:${file.lastModified}`;
                if (existingFileKeySet.has(fileKey)) {
                    continue;
                }

                if (taskRetainedAttachments.length + next.length >= ITEM_ATTACHMENT_MAX_COUNT) {
                    pendingAlerts.push(`첨부 파일은 최대 ${ITEM_ATTACHMENT_MAX_COUNT}개까지 등록할 수 있습니다.`);
                    break;
                }

                const isImageLike = isImageLikeFile(file);

                if (!isImageLike && file.size > ITEM_ATTACHMENT_NON_IMAGE_MAX_BYTES) {
                    pendingAlerts.push(`${file.name} 파일은 10MB를 초과하여 첨부에서 제외되었습니다.`);
                    continue;
                }

                if (isImageLike && file.size > BOARD_IMAGE_MAX_BYTES) {
                    pendingAlerts.push(`${file.name} 이미지는 500KB를 초과해 업로드 시 자동 최적화됩니다.`);
                }

                existingFileKeySet.add(fileKey);

                const previewUrl = isImageLike ? URL.createObjectURL(file) : null;
                if (previewUrl) {
                    taskPreviewUrlSetRef.current.add(previewUrl);
                }

                next.push({
                    key: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
                    file,
                    previewUrl,
                    isImageLike,
                });
            }

            return next;
        });

        // Show collected alerts sequentially after the state update
        if (pendingAlerts.length > 0) {
            window.setTimeout(() => {
                for (const message of pendingAlerts) {
                    alert(message);
                }
            }, 0);
        }
    };

    const handleOpenTaskAttachmentPicker = () => {
        taskAttachmentInputRef.current?.click();
    };

    const handleRemoveRetainedTaskAttachment = (storagePath: string) => {
        setTaskRetainedAttachments((prev) =>
            prev.filter((attachment) => attachment.storagePath !== storagePath)
        );
    };

    const handleRemoveNewTaskAttachment = (targetKey: string) => {
        setTaskNewAttachments((prev) => {
            const target = prev.find((entry) => entry.key === targetKey);
            if (target?.previewUrl) {
                URL.revokeObjectURL(target.previewUrl);
                taskPreviewUrlSetRef.current.delete(target.previewUrl);
            }
            return prev.filter((entry) => entry.key !== targetKey);
        });
    };

    const handlePreviewNewTaskAttachment = (targetKey: string) => {
        const target = taskNewAttachments.find((entry) => entry.key === targetKey);
        if (!target) {
            return;
        }

        const objectUrl = URL.createObjectURL(target.file);
        window.open(objectUrl, '_blank', 'noopener,noreferrer');
        window.setTimeout(() => {
            URL.revokeObjectURL(objectUrl);
        }, 15000);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        const title = formData.title.trim();
        const content = formData.content.trim();
        if (!title || !content) {
            alert('제목과 내용을 모두 입력해 주세요.');
            return;
        }

        if (activeTab === 'TASK' && formData.startDate && formData.endDate && formData.startDate > formData.endDate) {
            alert('종료일은 시작일보다 빠를 수 없습니다.');
            return;
        }

        if (totalAttachmentCount > ITEM_ATTACHMENT_MAX_COUNT) {
            alert(`첨부 파일은 최대 ${ITEM_ATTACHMENT_MAX_COUNT}개까지 등록할 수 있습니다.`);
            return;
        }

        try {
            const nextType = isEditMode ? (editItem?.type ?? activeTab) : activeTab;
            const result = await onSubmit({
                ...formData,
                title,
                content,
                type: nextType,
                category: formData.category || defaultCategory,
                attachmentFiles: taskNewAttachments.map((entry) => entry.file),
                retainedAttachments: taskRetainedAttachments,
                taskAttachmentFiles: taskNewAttachments.map((entry) => entry.file),
                taskRetainedAttachments: taskRetainedAttachments,
            });

            if (result !== false) {
                onClose();
            }
        } catch (error) {
            alert(toErrorMessage(error, '작성 저장 중 오류가 발생했습니다.'));
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div
                className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity cursor-pointer"
                onClick={() => {
                    if (!isSubmitting) {
                        onClose();
                    }
                }}
            />

            <div className="relative w-full sm:max-w-2xl bg-white rounded-t-2xl sm:rounded-2xl shadow-xl transform transition-transform duration-300 max-h-[90vh] flex flex-col">
                <div className="flex items-center justify-between p-4 border-b border-gray-100">
                    <h2 className="text-lg font-bold text-gray-900">
                        {isEditMode ? '항목 수정' : '새로운 작성'}
                    </h2>
                    <button
                        onClick={onClose}
                        disabled={isSubmitting}
                        className="p-2 hover:bg-gray-100 rounded-full transition-colors disabled:opacity-50 cursor-pointer"
                    >
                        <X className="w-5 h-5 text-gray-500" />
                    </button>
                </div>

                <div className="flex p-2 border-b border-gray-100 gap-2">
                    <button
                        onClick={() => setActiveTab('TASK')}
                        type="button"
                        disabled={isSubmitting || isEditMode}
                        className={clsx(
                            'flex-1 py-2.5 text-sm font-bold rounded-xl transition-all cursor-pointer',
                            activeTab === 'TASK' ? 'bg-gray-900 text-white shadow-md' : 'bg-gray-50 text-gray-500 hover:bg-gray-100',
                            isSubmitting && 'opacity-50',
                            isEditMode && 'cursor-not-allowed opacity-70'
                        )}
                    >
                        업무 (Task)
                    </button>
                    <button
                        onClick={() => setActiveTab('POST')}
                        type="button"
                        disabled={isSubmitting || isEditMode}
                        className={clsx(
                            'flex-1 py-2.5 text-sm font-bold rounded-xl transition-all cursor-pointer',
                            activeTab === 'POST' ? 'bg-gray-900 text-white shadow-md' : 'bg-gray-50 text-gray-500 hover:bg-gray-100',
                            isSubmitting && 'opacity-50',
                            isEditMode && 'cursor-not-allowed opacity-70'
                        )}
                    >
                        글 (Post)
                    </button>
                </div>

                <div className="p-6 overflow-y-auto flex-1">
                    <form id="create-post-form" onSubmit={handleSubmit} className="space-y-6">
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">제목</label>
                                <input
                                    type="text"
                                    value={formData.title}
                                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                    placeholder={activeTab === 'TASK' ? '어떤 업무인가요?' : '어떤 소식을 공유할까요?'}
                                    className="w-full text-lg font-bold text-gray-900 border-none outline-none placeholder:text-gray-300 focus:ring-0 p-0"
                                    autoFocus
                                    disabled={isSubmitting}
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">내용</label>
                                <textarea
                                    value={formData.content}
                                    onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                                    placeholder={activeTab === 'TASK' ? '업무에 대한 상세 내용을 적어주세요.' : '자유롭게 내용을 작성해주세요.'}
                                    className="w-full min-h-[150px] resize-none border px-4 py-3 rounded-xl border-gray-200 focus:border-gray-900 focus:ring-4 focus:ring-gray-50 transition-all outline-none text-sm leading-relaxed text-gray-900"
                                    disabled={isSubmitting}
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wide">
                                    파일 첨부 ({totalAttachmentCount}/{ITEM_ATTACHMENT_MAX_COUNT})
                                </label>
                                {totalAttachmentCount === 0 ? (
                                    <div className="mb-3 flex min-h-24 items-center justify-center rounded-xl border border-dashed border-gray-200 text-xs text-gray-400">
                                        첨부된 파일이 없습니다.
                                    </div>
                                ) : (
                                    <div className="mb-3 space-y-2">
                                        {taskRetainedAttachments.map((attachment) => (
                                            <div
                                                key={attachment.storagePath}
                                                className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2"
                                            >
                                                {isImageMime(attachment.mimeType) ? (
                                                    <a
                                                        href={attachment.fileUrl}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="h-10 w-10 overflow-hidden rounded border border-gray-200"
                                                    >
                                                        <img
                                                            src={attachment.fileUrl}
                                                            alt={attachment.originalFilename}
                                                            className="h-full w-full object-cover"
                                                        />
                                                    </a>
                                                ) : (
                                                    <span className="inline-flex h-10 w-10 items-center justify-center rounded border border-gray-200 bg-gray-50">
                                                        {getAttachmentIcon(attachment.mimeType)}
                                                    </span>
                                                )}
                                                <a
                                                    href={attachment.fileUrl}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="min-w-0 flex-1 text-sm text-gray-800 truncate hover:underline"
                                                >
                                                    {attachment.originalFilename}
                                                </a>
                                                <span className="text-xs text-gray-400">
                                                    {formatFileSize(attachment.fileSizeBytes)}
                                                </span>
                                                <a
                                                    href={attachment.fileUrl}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-gray-200 px-2 py-1 text-xs font-semibold text-gray-600 hover:bg-gray-50"
                                                >
                                                    <Eye className="h-3.5 w-3.5" />
                                                    미리보기
                                                </a>
                                                <button
                                                    type="button"
                                                    onClick={() => handleRemoveRetainedTaskAttachment(attachment.storagePath)}
                                                    disabled={isSubmitting}
                                                    className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-red-100 px-2 py-1 text-xs font-semibold text-red-500 hover:bg-red-50"
                                                >
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                    제거
                                                </button>
                                            </div>
                                        ))}

                                        {taskNewAttachments.map((attachment) => (
                                            <div
                                                key={attachment.key}
                                                className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2"
                                            >
                                                {attachment.previewUrl ? (
                                                    <span className="h-10 w-10 overflow-hidden rounded border border-gray-200">
                                                        <img
                                                            src={attachment.previewUrl}
                                                            alt={attachment.file.name}
                                                            className="h-full w-full object-cover"
                                                        />
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex h-10 w-10 items-center justify-center rounded border border-gray-200 bg-gray-50">
                                                        {getAttachmentIcon(attachment.file.type)}
                                                    </span>
                                                )}
                                                <span className="min-w-0 flex-1 text-sm text-gray-800 truncate">
                                                    {attachment.file.name}
                                                </span>
                                                <span className="text-xs text-gray-400">
                                                    {formatFileSize(attachment.file.size)}
                                                </span>
                                                <button
                                                    type="button"
                                                    onClick={() => handlePreviewNewTaskAttachment(attachment.key)}
                                                    disabled={isSubmitting}
                                                    className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-gray-200 px-2 py-1 text-xs font-semibold text-gray-600 hover:bg-gray-50"
                                                >
                                                    <Eye className="h-3.5 w-3.5" />
                                                    미리보기
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => handleRemoveNewTaskAttachment(attachment.key)}
                                                    disabled={isSubmitting}
                                                    className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-red-100 px-2 py-1 text-xs font-semibold text-red-500 hover:bg-red-50"
                                                >
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                    제거
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}



                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={handleOpenTaskAttachmentPicker}
                                        className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                                    >
                                        <Paperclip className="h-3.5 w-3.5" />
                                        파일 선택
                                    </button>
                                    <input
                                        id="board-task-attachment-input"
                                        ref={taskAttachmentInputRef}
                                        type="file"
                                        multiple
                                        onChange={handleTaskAttachmentChange}
                                        className="hidden"
                                        disabled={isSubmitting}
                                    />
                                </div>
                                <p className="mt-2 text-xs font-semibold text-red-500">
                                    * 첨부 파일은 최대 5개까지 등록됩니다. 이미지는 500KB를 초과하면 자동 최적화 후 업로드되며, 이미지 외 파일은 10MB를 초과하면 첨부에서 제외됩니다.
                                </p>
                            </div>
                        </div>

                        {activeTab === 'TASK' && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-gray-50">
                                <div>
                                    <label className="flex items-center text-xs font-bold text-gray-500 mb-2">
                                        <Tag className="w-3.5 h-3.5 mr-1.5" />
                                        부서 / 카테고리
                                    </label>
                                    <select
                                        value={formData.category}
                                        onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                                        className="w-full h-11 px-3 bg-gray-50 border-none rounded-lg text-sm font-medium text-gray-900 focus:ring-2 focus:ring-gray-200 outline-none"
                                        disabled={isSubmitting}
                                    >
                                        {selectableCategoryTabs.map((tab) => (
                                            <option key={tab.id} value={tab.id}>{tab.label}</option>
                                        ))}
                                    </select>
                                </div>

                                {!isEditMode && (
                                    <div>
                                        <label className="flex items-center text-xs font-bold text-gray-500 mb-2">
                                            <Tag className="w-3.5 h-3.5 mr-1.5" />
                                            상태
                                        </label>
                                        <select
                                            value={formData.status}
                                            onChange={(e) => setFormData({ ...formData, status: toTaskStatus(e.target.value) })}
                                            className="w-full h-11 px-3 bg-gray-50 border-none rounded-lg text-sm font-medium text-gray-900 focus:ring-2 focus:ring-gray-200 outline-none"
                                            disabled={isSubmitting}
                                        >
                                            {statusTabs.map((tab) => (
                                                <option key={tab.id} value={tab.id}>{tab.label}</option>
                                            ))}
                                        </select>
                                    </div>
                                )}

                                <div>
                                    <label className="flex items-center text-xs font-bold text-gray-500 mb-2">
                                        <Flag className="w-3.5 h-3.5 mr-1.5" />
                                        우선순위
                                    </label>
                                    <select
                                        value={formData.priority}
                                        onChange={(e) => setFormData({ ...formData, priority: e.target.value as TaskPriority })}
                                        className="w-full h-11 px-3 bg-gray-50 border-none rounded-lg text-sm font-medium text-gray-900 focus:ring-2 focus:ring-gray-200 outline-none"
                                        disabled={isSubmitting}
                                    >
                                        {PRIORITY_OPTIONS.map((option) => (
                                            <option key={option.id} value={option.id}>{option.label}</option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="flex items-center text-xs font-bold text-gray-500 mb-2">
                                        <Calendar className="w-3.5 h-3.5 mr-1.5" />
                                        시작일
                                    </label>
                                    <input
                                        type="date"
                                        value={formData.startDate}
                                        onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                                        className="w-full h-11 px-3 bg-gray-50 border-none rounded-lg text-sm font-medium text-gray-900 focus:ring-2 focus:ring-gray-200 outline-none"
                                        disabled={isSubmitting}
                                    />
                                </div>

                                <div>
                                    <label className="flex items-center text-xs font-bold text-gray-500 mb-2">
                                        <Calendar className="w-3.5 h-3.5 mr-1.5" />
                                        종료일
                                    </label>
                                    <input
                                        type="date"
                                        value={formData.endDate}
                                        onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                                        className="w-full h-11 px-3 bg-gray-50 border-none rounded-lg text-sm font-medium text-gray-900 focus:ring-2 focus:ring-gray-200 outline-none"
                                        disabled={isSubmitting}
                                    />
                                </div>

                                <div className="sm:col-span-2">
                                    <label className="flex items-center text-xs font-bold text-gray-500 mb-2">
                                        <Users className="w-3.5 h-3.5 mr-1.5" />
                                        담당자
                                    </label>
                                    <div className="space-y-2">
                                        <div className="relative">
                                            <input
                                                type="text"
                                                value={assigneeInput}
                                                onCompositionStart={() => setIsAssigneeComposing(true)}
                                                onCompositionEnd={() => setIsAssigneeComposing(false)}
                                                onChange={(e) => setAssigneeInput(e.target.value)}
                                                onKeyDown={handleAssigneeInputKeyDown}
                                                onFocus={() => setIsAssigneeInputFocused(true)}
                                                onBlur={() => setIsAssigneeInputFocused(false)}
                                                placeholder="이름/초성 검색 (예: 김 또는 ㄱ)"
                                                className="w-full px-4 py-3 bg-[#FFF8F9] border border-[#EED7DB] rounded-lg focus:ring-2 focus:outline-none text-gray-900 placeholder:text-gray-400"
                                                disabled={isSubmitting}
                                            />
                                            {showAssigneeSuggestions && (
                                                <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-56 overflow-y-auto rounded-lg border border-[#EED7DB] bg-white shadow-lg">
                                                    {filteredAssigneeCandidates.length === 0 ? (
                                                        <p className="px-3 py-2 text-xs text-gray-500">일치하는 담당자가 없습니다.</p>
                                                    ) : (
                                                        <ul className="py-1">
                                                            {filteredAssigneeCandidates.map((assignee) => (
                                                                <li key={assignee.id}>
                                                                    <button
                                                                        type="button"
                                                                        onMouseDown={(event) => event.preventDefault()}
                                                                        onClick={() => handleSelectAssignee(assignee)}
                                                                        className="w-full px-3 py-2 text-left text-sm text-gray-800 hover:bg-[#FFF3F6] cursor-pointer"
                                                                    >
                                                                        {formatAssigneeLabel(assignee)}
                                                                    </button>
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                        <p className="text-xs text-gray-500">목록에서 선택한 멤버만 담당자로 추가됩니다.</p>
                                        <div className="flex flex-wrap gap-2 min-h-8">
                                            {selectedAssignees.length === 0 && (
                                                <p className="text-xs text-gray-400">아직 추가된 담당자가 없습니다.</p>
                                            )}
                                            {selectedAssignees.map((assignee) => (
                                                <span
                                                    key={assignee.id}
                                                    className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium text-white bg-[#B95D69]"
                                                >
                                                    {formatAssigneeLabel(assignee)}
                                                    <button
                                                        type="button"
                                                        onClick={() => handleRemoveAssignee(assignee.id)}
                                                        className="ml-2 hover:text-red-100 focus:outline-none cursor-pointer"
                                                        disabled={isSubmitting}
                                                    >
                                                        <X className="w-3 h-3" />
                                                    </button>
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'POST' && (
                            <div className="pt-4 border-t border-gray-50">
                                <label className="flex items-center text-xs font-bold text-gray-500 mb-2">
                                    <Tag className="w-3.5 h-3.5 mr-1.5" />
                                    카테고리
                                </label>
                                <select
                                    value={formData.category}
                                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                                    className="w-full h-11 px-3 bg-gray-50 border-none rounded-lg text-sm font-medium text-gray-900 focus:ring-2 focus:ring-gray-200 outline-none"
                                    disabled={isSubmitting}
                                >
                                    {selectableCategoryTabs.map((tab) => (
                                        <option key={tab.id} value={tab.id}>{tab.label}</option>
                                    ))}
                                </select>

                                <div className="mt-4">
                                    <label className="flex items-center text-xs font-bold text-gray-500 mb-2">
                                        <Users className="w-3.5 h-3.5 mr-1.5" />
                                        담당자
                                    </label>
                                    <div className="space-y-2">
                                        <div className="relative">
                                            <input
                                                type="text"
                                                value={assigneeInput}
                                                onCompositionStart={() => setIsAssigneeComposing(true)}
                                                onCompositionEnd={() => setIsAssigneeComposing(false)}
                                                onChange={(e) => setAssigneeInput(e.target.value)}
                                                onKeyDown={handleAssigneeInputKeyDown}
                                                onFocus={() => setIsAssigneeInputFocused(true)}
                                                onBlur={() => setIsAssigneeInputFocused(false)}
                                                placeholder="이름/초성 검색 (예: 김 또는 ㄱ)"
                                                className="w-full px-4 py-3 bg-[#FFF8F9] border border-[#EED7DB] rounded-lg focus:ring-2 focus:outline-none text-gray-900 placeholder:text-gray-400"
                                                disabled={isSubmitting}
                                            />
                                            {showAssigneeSuggestions && (
                                                <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-56 overflow-y-auto rounded-lg border border-[#EED7DB] bg-white shadow-lg">
                                                    {filteredAssigneeCandidates.length === 0 ? (
                                                        <p className="px-3 py-2 text-xs text-gray-500">일치하는 담당자가 없습니다.</p>
                                                    ) : (
                                                        <ul className="py-1">
                                                            {filteredAssigneeCandidates.map((assignee) => (
                                                                <li key={assignee.id}>
                                                                    <button
                                                                        type="button"
                                                                        onMouseDown={(event) => event.preventDefault()}
                                                                        onClick={() => handleSelectAssignee(assignee)}
                                                                        className="w-full px-3 py-2 text-left text-sm text-gray-800 hover:bg-[#FFF3F6] cursor-pointer"
                                                                    >
                                                                        {formatAssigneeLabel(assignee)}
                                                                    </button>
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                        <p className="text-xs text-gray-500">목록에서 선택한 멤버만 담당자로 추가됩니다.</p>
                                        <div className="flex flex-wrap gap-2 min-h-8">
                                            {selectedAssignees.length === 0 && (
                                                <p className="text-xs text-gray-400">아직 추가된 담당자가 없습니다.</p>
                                            )}
                                            {selectedAssignees.map((assignee) => (
                                                <span
                                                    key={assignee.id}
                                                    className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium text-white bg-[#B95D69]"
                                                >
                                                    {formatAssigneeLabel(assignee)}
                                                    <button
                                                        type="button"
                                                        onClick={() => handleRemoveAssignee(assignee.id)}
                                                        className="ml-2 hover:text-red-100 focus:outline-none cursor-pointer"
                                                        disabled={isSubmitting}
                                                    >
                                                        <X className="w-3 h-3" />
                                                    </button>
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </form>
                </div>

                <div className="p-4 border-t border-gray-100 bg-white/50 backdrop-blur-sm rounded-b-2xl">
                    <button
                        type="submit"
                        form="create-post-form"
                        disabled={isSubmitting}
                        className="w-full bg-gray-900 text-white h-12 rounded-xl font-bold hover:bg-gray-800 transition-transform active:scale-95 shadow-lg shadow-gray-200 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
                    >
                        {isSubmitting
                            ? '저장 중...'
                            : isEditMode
                                ? '수정하기'
                                : activeTab === 'TASK'
                                    ? '업무 등록하기'
                                    : '글 게시하기'}
                    </button>
                </div>
            </div>
        </div>
    );
}
