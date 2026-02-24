import React, { useEffect, useMemo, useState } from 'react';
import { X, Calendar, Users, Tag, Flag } from 'lucide-react';
import { clsx } from 'clsx';
import { toErrorMessage } from '@/lib/api/errors';
import type { CreateProjectItemInput, ProjectMemberOption, TaskPriority, TaskStatus } from '@/types/workflow';

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
    assigneeOptions?: ProjectMemberOption[];
    isSubmitting?: boolean;
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

type TabType = 'TASK' | 'POST';

const PRIORITY_OPTIONS: { id: TaskPriority; label: string }[] = [
    { id: 'URGENT', label: '긴급' },
    { id: 'HIGH', label: '높음' },
    { id: 'NORMAL', label: '보통' },
    { id: 'LOW', label: '낮음' },
];

const TASK_STATUS_VALUES: TaskStatus[] = ['REQUEST', 'PROGRESS', 'FEEDBACK', 'REVIEW', 'DONE', 'HOLD', 'ISSUE'];

function toTaskStatus(status: string | undefined): TaskStatus {
    return TASK_STATUS_VALUES.includes(status as TaskStatus) ? (status as TaskStatus) : 'REQUEST';
}

export function CreatePostModal({
    isOpen,
    onClose,
    onSubmit,
    statusTabs,
    categoryTabs,
    assigneeOptions = [],
    isSubmitting = false,
}: CreatePostModalProps) {
    const [activeTab, setActiveTab] = useState<TabType>('TASK');

    const taskCategoryTabs = useMemo(
        () => categoryTabs.filter((tab) => tab.id !== 'ALL'),
        [categoryTabs]
    );
    const selectableCategoryTabs = taskCategoryTabs.length > 0 ? taskCategoryTabs : categoryTabs;

    const defaultCategory = selectableCategoryTabs[0]?.id ?? 'ALL';
    const defaultStatus = toTaskStatus(statusTabs[0]?.id);

    const [formData, setFormData] = useState<FormState>({
        title: '',
        content: '',
        status: defaultStatus,
        priority: 'NORMAL',
        assignees: [],
        startDate: '',
        endDate: '',
        category: defaultCategory,
    });

    useEffect(() => {
        if (!isOpen) {
            return;
        }

        const timer = window.setTimeout(() => {
            setActiveTab('TASK');
            setFormData({
                title: '',
                content: '',
                status: defaultStatus,
                priority: 'NORMAL',
                assignees: [],
                startDate: '',
                endDate: '',
                category: defaultCategory,
            });
        }, 0);

        return () => window.clearTimeout(timer);
    }, [isOpen, defaultCategory, defaultStatus]);

    const selectedAssignees = assigneeOptions.filter((assignee) => formData.assignees.includes(assignee.id));
    const availableAssignees = assigneeOptions.filter((assignee) => !formData.assignees.includes(assignee.id));

    if (!isOpen) return null;

    const handleAddAssignee = (assigneeId: string) => {
        if (!assigneeId || formData.assignees.includes(assigneeId)) {
            return;
        }

        setFormData((prev) => ({
            ...prev,
            assignees: [...prev.assignees, assigneeId],
        }));
    };

    const handleRemoveAssignee = (assigneeId: string) => {
        setFormData((prev) => ({
            ...prev,
            assignees: prev.assignees.filter((id) => id !== assigneeId),
        }));
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

        try {
            const result = await onSubmit({
                ...formData,
                title,
                content,
                type: activeTab,
                category: formData.category || defaultCategory,
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
                className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
                onClick={() => {
                    if (!isSubmitting) {
                        onClose();
                    }
                }}
            />

            <div className="relative w-full sm:max-w-2xl bg-white rounded-t-2xl sm:rounded-2xl shadow-xl transform transition-transform duration-300 max-h-[90vh] flex flex-col">
                <div className="flex items-center justify-between p-4 border-b border-gray-100">
                    <h2 className="text-lg font-bold text-gray-900">새로운 작성</h2>
                    <button
                        onClick={onClose}
                        disabled={isSubmitting}
                        className="p-2 hover:bg-gray-100 rounded-full transition-colors disabled:opacity-50"
                    >
                        <X className="w-5 h-5 text-gray-500" />
                    </button>
                </div>

                <div className="flex p-2 border-b border-gray-100 gap-2">
                    <button
                        onClick={() => setActiveTab('TASK')}
                        type="button"
                        disabled={isSubmitting}
                        className={clsx(
                            'flex-1 py-2.5 text-sm font-bold rounded-xl transition-all',
                            activeTab === 'TASK'
                                ? 'bg-gray-900 text-white shadow-md'
                                : 'bg-gray-50 text-gray-500 hover:bg-gray-100',
                            isSubmitting && 'opacity-50'
                        )}
                    >
                        업무 (Task)
                    </button>
                    <button
                        onClick={() => setActiveTab('POST')}
                        type="button"
                        disabled={isSubmitting}
                        className={clsx(
                            'flex-1 py-2.5 text-sm font-bold rounded-xl transition-all',
                            activeTab === 'POST'
                                ? 'bg-gray-900 text-white shadow-md'
                                : 'bg-gray-50 text-gray-500 hover:bg-gray-100',
                            isSubmitting && 'opacity-50'
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
                                        <div className="flex flex-wrap gap-2 min-h-10">
                                            {selectedAssignees.length === 0 ? (
                                                <span className="text-sm text-gray-400">담당자를 선택해 주세요.</span>
                                            ) : (
                                                selectedAssignees.map((assignee) => (
                                                    <span
                                                        key={assignee.id}
                                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-900 text-white text-sm"
                                                    >
                                                        <span>{assignee.name}</span>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleRemoveAssignee(assignee.id)}
                                                            className="rounded-full p-0.5 hover:bg-white/20"
                                                            disabled={isSubmitting}
                                                        >
                                                            <X className="w-3.5 h-3.5" />
                                                        </button>
                                                    </span>
                                                ))
                                            )}
                                        </div>
                                        <select
                                            value=""
                                            onChange={(e) => {
                                                handleAddAssignee(e.target.value);
                                                e.currentTarget.value = '';
                                            }}
                                            className="w-full h-11 px-3 bg-gray-50 border-none rounded-lg text-sm font-medium text-gray-900 focus:ring-2 focus:ring-gray-200 outline-none"
                                            disabled={isSubmitting || availableAssignees.length === 0}
                                        >
                                            <option value="">{availableAssignees.length === 0 ? '선택 가능한 담당자 없음' : '담당자 추가'}</option>
                                            {availableAssignees.map((assignee) => (
                                                <option key={assignee.id} value={assignee.id}>{assignee.name}</option>
                                            ))}
                                        </select>
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
                            </div>
                        )}
                    </form>
                </div>

                <div className="p-4 border-t border-gray-100 bg-white/50 backdrop-blur-sm rounded-b-2xl">
                    <button
                        type="submit"
                        form="create-post-form"
                        disabled={isSubmitting}
                        className="w-full bg-gray-900 text-white h-12 rounded-xl font-bold hover:bg-gray-800 transition-transform active:scale-95 shadow-lg shadow-gray-200 disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                        {isSubmitting ? '저장 중...' : activeTab === 'TASK' ? '업무 등록하기' : '글 게시하기'}
                    </button>
                </div>
            </div>
        </div>
    );
}
