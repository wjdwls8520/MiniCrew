'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
    Calendar,
    Users,
    Lock,
    Globe,
    Type,
    AlignLeft,
    Check,
    Palette,
    X,
    Briefcase
} from 'lucide-react';
import { useUI } from '@/context/UIContext';
import { clsx } from 'clsx';
import { toErrorMessage } from '@/lib/api/errors';

// Preset Colors (Rose Gold Theme compatible)
const THEME_COLORS = [
    { name: 'Rose', value: '#B95D69' },
    { name: 'Peach', value: '#E08D79' },
    { name: 'Gold', value: '#D4AF37' },
    { name: 'Sage', value: '#8FBC8F' },
    { name: 'Sky', value: '#87CEEB' },
    { name: 'Lavender', value: '#E6E6FA' },
    { name: 'Gray', value: '#708090' },
];

type RingColorStyle = React.CSSProperties & { '--tw-ring-color': string };

function getRingColorStyle(color: string): RingColorStyle {
    return { '--tw-ring-color': color };
}

export function CreateProjectModal() {
    const { isCreateProjectModalOpen, closeCreateProjectModal, addProject } = useUI();
    const [isMounted, setIsMounted] = useState(false);
    const [isVisible, setIsVisible] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const [formData, setFormData] = useState({
        name: '',
        description: '',
        category: '', // Subject Header (e.g., Web Dev)
        startDate: '',
        endDate: '',
        visibility: 'private', // 'private' | 'public'
        themeColor: '#B95D69',
        tags: [] as string[],
        initialMembers: [] as { name: string; email?: string; role: 'leader' | 'member' }[]
    });

    const [tagInput, setTagInput] = useState('');
    const [memberNameInput, setMemberNameInput] = useState('');
    const [memberEmailInput, setMemberEmailInput] = useState('');
    const [memberRoleInput, setMemberRoleInput] = useState<'leader' | 'member'>('member');

    // Handle Animation State & Body Scroll Lock
    useEffect(() => {
        if (isCreateProjectModalOpen) {
            setIsMounted(true);
            document.body.style.overflow = 'hidden'; // Lock scroll

            // Small delay to allow mount then trigger animation
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    setIsVisible(true);
                });
            });

            // Reset form when opened
            setFormData({
                name: '',
                description: '',
                category: '',
                startDate: '',
                endDate: '',
                visibility: 'private',
                themeColor: '#B95D69',
                tags: [],
                initialMembers: []
            });
            setTagInput('');
            setMemberNameInput('');
            setMemberEmailInput('');
            setMemberRoleInput('member');
        } else {
            setIsVisible(false);
            document.body.style.overflow = 'unset'; // Unlock scroll

            // Delay unmounting to allow exit animation to play
            const timer = setTimeout(() => {
                setIsMounted(false);
            }, 300); // Match Tailwind duration-300
            return () => clearTimeout(timer);
        }

        // Cleanup function to ensure scroll is unlocked if component unmounts unexpectedly
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, [isCreateProjectModalOpen]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        const nativeEvent = e.nativeEvent as KeyboardEvent;
        const isComposing = nativeEvent.isComposing || nativeEvent.keyCode === 229;
        if (isComposing || e.key !== 'Enter') {
            return;
        }

        e.preventDefault();
        const newTag = tagInput.trim();
        if (newTag && !formData.tags.includes(newTag)) {
            setFormData(prev => ({ ...prev, tags: [...prev.tags, newTag] }));
            setTagInput('');
        }
    };

    const removeTag = (tagToRemove: string) => {
        setFormData(prev => ({ ...prev, tags: prev.tags.filter(tag => tag !== tagToRemove) }));
    };

    const handleAddInitialMember = () => {
        const name = memberNameInput.trim();
        const email = memberEmailInput.trim().toLowerCase();

        if (!name) {
            alert('참여자 이름을 입력해 주세요.');
            return;
        }

        const isDuplicated = formData.initialMembers.some((member) => {
            const emailMatched = email && member.email && member.email.toLowerCase() === email;
            const nameMatched = member.name.toLowerCase() === name.toLowerCase();
            return Boolean(emailMatched || nameMatched);
        });

        if (isDuplicated) {
            alert('이미 추가된 참여자입니다.');
            return;
        }

        setFormData((prev) => ({
            ...prev,
            initialMembers: [
                ...prev.initialMembers,
                {
                    name,
                    email: email || undefined,
                    role: memberRoleInput,
                }
            ],
        }));

        setMemberNameInput('');
        setMemberEmailInput('');
        setMemberRoleInput('member');
    };

    const removeInitialMember = (index: number) => {
        setFormData((prev) => ({
            ...prev,
            initialMembers: prev.initialMembers.filter((_, memberIndex) => memberIndex !== index),
        }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        const normalizedStartDate = formData.startDate.trim();
        const normalizedEndDate = formData.endDate.trim();

        if (normalizedStartDate && normalizedEndDate && normalizedStartDate > normalizedEndDate) {
            alert('종료일은 시작일보다 빠를 수 없습니다.');
            return;
        }

        const payload = {
            name: formData.name.trim(),
            description: formData.description.trim(),
            startDate: formData.startDate,
            endDate: formData.endDate,
            isFavorite: false,
            category: formData.category.trim() || '미분류',
            themeColor: formData.themeColor,
            tags: formData.tags,
            visibility: formData.visibility as 'private' | 'public',
            initialMembers: formData.initialMembers,
        };

        try {
            setIsSubmitting(true);
            await addProject(payload);
            alert('프로젝트가 생성되었습니다!');
            closeCreateProjectModal();
        } catch (error) {
            alert(toErrorMessage(error, '프로젝트 생성에 실패했습니다.'));
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!isMounted) return null;

    // Animation Classes
    const modalAnimationClass = isVisible
        ? "translate-y-0 opacity-100 scale-100"
        : "translate-y-full opacity-0 scale-95";

    const backdropAnimationClass = isVisible
        ? "opacity-100"
        : "opacity-0";

    // Use createPortal to render modal at the end of document.body
    return createPortal(
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6 key-modal-container">
            {/* Backdrop */}
            <div
                className={clsx(
                    "fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-300 ease-out",
                    backdropAnimationClass
                )}
                onClick={closeCreateProjectModal}
                aria-hidden="true"
            />

            {/* Modal Content */}
            <div className={clsx(
                "relative bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden transition-all duration-300 ease-out transform",
                modalAnimationClass
            )}>

                {/* Modal Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-[#EED7DB] bg-[#FFF8F9]">
                    <h2 className="text-xl font-bold text-[#5E4246]">새 프로젝트 생성</h2>
                    <button
                        onClick={closeCreateProjectModal}
                        className="p-2 hover:bg-[#FCEBF0] rounded-full text-[#A8646E] transition-colors cursor-pointer"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Modal Body (Scrollable) */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    <form id="create-project-form" onSubmit={handleSubmit} className="space-y-6">

                        {/* 0. Project Category (Subject Header) */}
                        <div className="space-y-3">
                            <label className="block text-sm font-semibold text-[#5E4246] flex items-center">
                                <Briefcase className="w-4 h-4 mr-2" style={{ color: formData.themeColor }} />
                                프로젝트 분류 (말머리) <span className="text-red-500 ml-1">*</span>
                            </label>
                            <div className="relative w-full sm:w-1/2">
                                <input
                                    type="text"
                                    required
                                    maxLength={10}
                                    className="w-full px-4 py-3 bg-[#FFF8F9] border border-[#EED7DB] rounded-lg focus:ring-2 focus:outline-none transition-all placeholder-gray-400 text-gray-800 placeholder:text-sm"
                                    style={getRingColorStyle(formData.themeColor)}
                                    placeholder="예) 웹개발, 마케팅, 회의 등"
                                    value={formData.category}
                                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                                    autoFocus
                                />
                            </div>
                        </div>

                        {/* 1. Project Name */}
                        <div className="space-y-3">
                            <label className="block text-sm font-semibold text-[#5E4246] flex items-center">
                                <Type className="w-4 h-4 mr-2" style={{ color: formData.themeColor }} />
                                프로젝트 명 <span className="text-red-500 ml-1">*</span>
                            </label>
                            <div
                                className="w-full px-4 py-3 bg-[#FFF8F9] border border-[#EED7DB] rounded-lg focus-within:ring-2 focus-within:outline-none transition-all flex flex-col"
                                style={getRingColorStyle(formData.themeColor)}
                            >
                                <input
                                    type="text"
                                    required
                                    maxLength={20}
                                    className="w-full bg-transparent outline-none placeholder-gray-400 text-gray-800"
                                    placeholder="프로젝트의 멋진 이름을 지어주세요"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                />
                                <div className="text-right text-xs text-gray-400 font-mono mt-1">
                                    {formData.name.length}/20
                                </div>
                            </div>
                        </div>

                        {/* 2. Description */}
                        <div className="space-y-3">
                            <label className="block text-sm font-semibold text-[#5E4246] flex items-center">
                                <AlignLeft className="w-4 h-4 mr-2" style={{ color: formData.themeColor }} />
                                설명 (선택)
                            </label>
                            <div
                                className="w-full px-4 py-3 bg-[#FFF8F9] border border-[#EED7DB] rounded-lg focus-within:ring-2 focus-within:outline-none transition-all flex flex-col"
                                style={getRingColorStyle(formData.themeColor)}
                            >
                                <textarea
                                    rows={3}
                                    maxLength={200}
                                    className="w-full bg-transparent outline-none placeholder-gray-400 text-gray-800 resize-none"
                                    placeholder="이 프로젝트의 목표나 주요 내용을 간단히 적어주세요."
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                />
                                <div className="text-right text-xs text-gray-400 font-mono mt-1">
                                    {formData.description.length}/200
                                </div>
                            </div>
                        </div>

                        {/* 3. Theme Color */}
                        <div className="space-y-3">
                            <label className="block text-sm font-semibold text-[#5E4246] flex items-center">
                                <Palette className="w-4 h-4 mr-2" style={{ color: formData.themeColor }} />
                                테마 색상 (메인 컬러)
                            </label>
                            <div className="flex gap-3 flex-wrap">
                                {THEME_COLORS.map((color) => (
                                    <button
                                        key={color.name}
                                        type="button"
                                        onClick={() => setFormData({ ...formData, themeColor: color.value })}
                                        className={`w-8 h-8 rounded-full border-2 transition-transform hover:scale-110 flex items-center justify-center ${formData.themeColor === color.value ? 'border-[#5E4246]' : 'border-transparent'} cursor-pointer`}
                                        style={{ backgroundColor: color.value }}
                                        title={color.name}
                                    >
                                        {formData.themeColor === color.value && <Check className="w-4 h-4 text-white drop-shadow-md" />}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* 4. Recruitment Roles (Tags) */}
                        <div className="space-y-3">
                            <label className="block text-sm font-semibold text-[#5E4246] flex items-center">
                                <Users className="w-4 h-4 mr-2" style={{ color: formData.themeColor }} />
                                참여 역할 / 부서
                            </label>
                            <div className="space-y-2">
                                <input
                                    type="text"
                                    className="w-full px-4 py-3 bg-[#FFF8F9] border border-[#EED7DB] rounded-lg focus:ring-2 focus:outline-none transition-all placeholder-gray-400 text-gray-800 placeholder:text-sm"
                                    style={getRingColorStyle(formData.themeColor)}
                                    placeholder="직군을 입력하고 엔터를 누르세요 (예: 기획, 백엔드, 디자인)"
                                    value={tagInput}
                                    onChange={(e) => setTagInput(e.target.value)}
                                    onKeyDown={handleKeyDown}
                                />
                                <div className="flex flex-wrap gap-2">
                                    {formData.tags.map((tag, index) => (
                                        <span
                                            key={index}
                                            className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium text-white shadow-sm transition-all animate-in fade-in zoom-in"
                                            style={{ backgroundColor: formData.themeColor }}
                                        >
                                            {tag}
                                            <button
                                                type="button"
                                                onClick={() => removeTag(tag)}
                                                className="ml-2 hover:text-red-200 focus:outline-none cursor-pointer"
                                            >
                                                <X className="w-3 h-3" />
                                            </button>
                                        </span>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* 5. Initial Members */}
                        <div className="space-y-3">
                            <label className="block text-sm font-semibold text-[#5E4246] flex items-center">
                                <Users className="w-4 h-4 mr-2" style={{ color: formData.themeColor }} />
                                초기 참여자
                            </label>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                                <input
                                    type="text"
                                    className="w-full px-4 py-3 bg-[#FFF8F9] border border-[#EED7DB] rounded-lg focus:ring-2 focus:outline-none text-gray-800 placeholder:text-sm"
                                    style={getRingColorStyle(formData.themeColor)}
                                    placeholder="이름"
                                    value={memberNameInput}
                                    onChange={(e) => setMemberNameInput(e.target.value)}
                                />
                                <input
                                    type="email"
                                    className="w-full px-4 py-3 bg-[#FFF8F9] border border-[#EED7DB] rounded-lg focus:ring-2 focus:outline-none text-gray-800 placeholder:text-sm"
                                    style={getRingColorStyle(formData.themeColor)}
                                    placeholder="이메일(선택)"
                                    value={memberEmailInput}
                                    onChange={(e) => setMemberEmailInput(e.target.value)}
                                />
                                <select
                                    value={memberRoleInput}
                                    onChange={(e) => setMemberRoleInput(e.target.value === 'leader' ? 'leader' : 'member')}
                                    className="w-full px-4 py-3 bg-[#FFF8F9] border border-[#EED7DB] rounded-lg focus:ring-2 focus:outline-none text-gray-800"
                                    style={getRingColorStyle(formData.themeColor)}
                                >
                                    <option value="member">멤버</option>
                                    <option value="leader">리더</option>
                                </select>
                            </div>
                            <div className="flex items-center justify-between">
                                <p className="text-xs text-gray-500">
                                    프로젝트 생성 직후 담당자 선택에 사용됩니다.
                                </p>
                                <button
                                    type="button"
                                    onClick={handleAddInitialMember}
                                    className="px-3 py-1.5 rounded-md text-xs text-white font-medium cursor-pointer"
                                    style={{ backgroundColor: formData.themeColor }}
                                >
                                    참여자 추가
                                </button>
                            </div>
                            <div className="flex flex-wrap gap-2 min-h-8">
                                {formData.initialMembers.length === 0 && (
                                    <p className="text-xs text-gray-400">아직 추가된 참여자가 없습니다.</p>
                                )}
                                {formData.initialMembers.map((member, index) => (
                                    <span
                                        key={`${member.name}-${member.email ?? 'no-email'}-${index}`}
                                        className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium text-white"
                                        style={{ backgroundColor: formData.themeColor }}
                                    >
                                        {member.name}
                                        {member.email ? ` (${member.email})` : ''}
                                        {member.role === 'leader' ? ' / 리더' : ' / 멤버'}
                                        <button
                                            type="button"
                                            onClick={() => removeInitialMember(index)}
                                            className="ml-2 hover:text-red-100 focus:outline-none cursor-pointer"
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                    </span>
                                ))}
                            </div>
                        </div>

                        {/* 6. Date Range */}
                        <div className="space-y-3">
                            <label className="block text-sm font-semibold text-[#5E4246] flex items-center">
                                <Calendar className="w-4 h-4 mr-2" style={{ color: formData.themeColor }} />
                                기간 설정 (선택)
                            </label>
                            <div className="flex flex-col md:flex-row gap-4">
                                <div className="flex-1 w-full">
                                    <input
                                        type="date"
                                        className="w-full px-4 py-3 bg-[#FFF8F9] border border-[#EED7DB] rounded-lg focus:ring-2 focus:outline-none text-gray-800"
                                        style={getRingColorStyle(formData.themeColor)}
                                        value={formData.startDate}
                                        onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                                    />
                                </div>
                                <span className="self-center text-gray-400">~</span>
                                <div className="flex-1 w-full">
                                    <input
                                        type="date"
                                        className="w-full px-4 py-3 bg-[#FFF8F9] border border-[#EED7DB] rounded-lg focus:ring-2 focus:outline-none text-gray-800"
                                        style={getRingColorStyle(formData.themeColor)}
                                        value={formData.endDate}
                                        onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* 7. Visibility */}
                        <div className="space-y-3">
                            <label className="block text-sm font-semibold text-[#5E4246] flex items-center">
                                {formData.visibility === 'public' ? (
                                    <Globe className="w-4 h-4 mr-2" style={{ color: formData.themeColor }} />
                                ) : (
                                    <Lock className="w-4 h-4 mr-2" style={{ color: formData.themeColor }} />
                                )}
                                공개 범위 <span className="text-red-500 ml-1">*</span>
                            </label>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <button
                                    type="button"
                                    onClick={() => setFormData({ ...formData, visibility: 'public' })}
                                    className={`p-4 rounded-lg border text-left transition-all ${formData.visibility === 'public' ? 'bg-[#FFF0F3]' : 'border-[#EED7DB] hover:bg-gray-50'} cursor-pointer`}
                                    style={{ borderColor: formData.visibility === 'public' ? formData.themeColor : undefined }}
                                >
                                    <div className="flex items-center mb-1">
                                        <Globe className={`w-5 h-5 mr-2 ${formData.visibility === 'public' ? '' : 'text-gray-400'}`} style={{ color: formData.visibility === 'public' ? formData.themeColor : undefined }} />
                                        <span className={`font-semibold ${formData.visibility === 'public' ? '' : 'text-gray-600'}`} style={{ color: formData.visibility === 'public' ? formData.themeColor : undefined }}>전체 공개</span>
                                    </div>
                                    <p className="text-xs text-gray-500 pl-7">워크스페이스의 모든 멤버가 볼 수 있습니다.</p>
                                </button>

                                <button
                                    type="button"
                                    onClick={() => setFormData({ ...formData, visibility: 'private' })}
                                    className={`p-4 rounded-lg border text-left transition-all ${formData.visibility === 'private' ? 'bg-[#FFF0F3]' : 'border-[#EED7DB] hover:bg-gray-50'} cursor-pointer`}
                                    style={{ borderColor: formData.visibility === 'private' ? formData.themeColor : undefined }}
                                >
                                    <div className="flex items-center mb-1">
                                        <Lock className={`w-5 h-5 mr-2 ${formData.visibility === 'private' ? '' : 'text-gray-400'}`} style={{ color: formData.visibility === 'private' ? formData.themeColor : undefined }} />
                                        <span className={`font-semibold ${formData.visibility === 'private' ? '' : 'text-gray-600'}`} style={{ color: formData.visibility === 'private' ? formData.themeColor : undefined }}>비공개</span>
                                    </div>
                                    <p className="text-xs text-gray-500 pl-7">초대된 멤버만 접근할 수 있습니다.</p>
                                </button>
                            </div>
                        </div>
                    </form>
                </div>

                {/* Modal Footer */}
                <div className="px-6 py-4 border-t border-[#EED7DB] bg-[#FFF8F9] flex flex-col md:flex-row justify-end gap-3 rounded-b-xl">
                    <button
                        type="button"
                        onClick={closeCreateProjectModal}
                        disabled={isSubmitting}
                        className="w-full md:w-auto px-6 py-2.5 rounded-lg border border-[#EED7DB] text-gray-600 bg-white hover:bg-gray-50 font-medium transition-colors order-1 md:order-1 cursor-pointer"
                    >
                        취소
                    </button>
                    <button
                        type="submit"
                        form="create-project-form"
                        disabled={isSubmitting}
                        className="w-full md:w-auto px-6 py-2.5 rounded-lg text-white font-medium shadow-sm transition-colors opacity-90 hover:opacity-100 order-2 md:order-2 cursor-pointer"
                        style={{ backgroundColor: formData.themeColor }}
                    >
                        {isSubmitting ? '생성 중...' : '프로젝트 생성하기'}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}
