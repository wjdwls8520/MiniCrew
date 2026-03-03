'use client';

import React, { useState, useEffect, useMemo } from 'react';
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
import { useAuth } from '@/context/AuthContext';
import { clsx } from 'clsx';
import { toErrorMessage } from '@/lib/api/errors';
import { isAnomalyBlockedError } from '@/lib/api/client';
import { listChatUsers } from '@/lib/api/chat';
import type { ChatUserItem } from '@/types/chat';

const THEME_COLORS = [
    { name: 'Rose', value: '#B95D69' },
    { name: 'Peach', value: '#E08D79' },
    { name: 'Gold', value: '#D4AF37' },
    { name: 'Sage', value: '#8FBC8F' },
    { name: 'Sky', value: '#87CEEB' },
    { name: 'Blue', value: '#4A90D9' },
    { name: 'Gray', value: '#708090' },
];

type RingColorStyle = React.CSSProperties & { '--tw-ring-color': string };
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

function getRingColorStyle(color: string): RingColorStyle {
    return { '--tw-ring-color': color };
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

function getCandidateFullName(candidate: ChatUserItem): string {
    const fullName = (candidate.fullName ?? '').trim();
    if (fullName) {
        return fullName;
    }
    const displayName = candidate.displayName.trim();
    return displayName || '사용자';
}

function getCandidateNickname(candidate: ChatUserItem): string {
    const nickname = (candidate.nickname ?? '').trim();
    if (nickname) {
        return nickname;
    }
    return candidate.displayName.trim() || getCandidateFullName(candidate);
}

function formatCandidateLabel(candidate: ChatUserItem): string {
    const fullName = getCandidateFullName(candidate);
    const nickname = getCandidateNickname(candidate);
    return `${fullName}(${nickname}) - ${candidate.email}`;
}

function matchesCandidateName(keyword: string, candidate: ChatUserItem): boolean {
    const normalizedKeyword = normalizeSearchKeyword(keyword);
    if (!normalizedKeyword) {
        return false;
    }

    const nameTargets = [getCandidateFullName(candidate), getCandidateNickname(candidate)];
    return nameTargets.some((target) => {
        const normalizedTarget = normalizeSearchKeyword(target);
        if (!normalizedTarget) {
            return false;
        }
        if (normalizedTarget.includes(normalizedKeyword)) {
            return true;
        }
        const initials = extractHangulInitials(target).replace(/\s+/g, '');
        return initials.includes(normalizedKeyword);
    });
}

export function CreateProjectModal() {
    const { isCreateProjectModalOpen, closeCreateProjectModal, addProject } = useUI();
    const { user, isAuthenticated, displayName } = useAuth();
    const [isMounted, setIsMounted] = useState(false);
    const [isVisible, setIsVisible] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isTagComposing, setIsTagComposing] = useState(false);
    const [isMemberNameComposing, setIsMemberNameComposing] = useState(false);

    const [formData, setFormData] = useState({
        name: '',
        description: '',
        category: '',
        startDate: '',
        endDate: '',
        visibility: 'private' as 'private' | 'public',
        themeColor: '#B95D69',
        tags: [] as string[],
        initialMembers: [] as { name: string; email: string; userId: string }[],
    });

    const [tagInput, setTagInput] = useState('');
    const [memberNameInput, setMemberNameInput] = useState('');
    const [allInviteCandidates, setAllInviteCandidates] = useState<ChatUserItem[]>([]);
    const [isInviteCandidatesLoading, setIsInviteCandidatesLoading] = useState(false);
    const [inviteCandidatesError, setInviteCandidatesError] = useState<string | null>(null);
    const [isMemberInputFocused, setIsMemberInputFocused] = useState(false);

    useEffect(() => {
        if (isCreateProjectModalOpen) {
            setIsMounted(true);
            document.body.style.overflow = 'hidden';

            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    setIsVisible(true);
                });
            });

            setFormData({
                name: '',
                description: '',
                category: '',
                startDate: '',
                endDate: '',
                visibility: 'private',
                themeColor: '#B95D69',
                tags: [],
                initialMembers: [],
            });
            setTagInput('');
            setMemberNameInput('');
            setAllInviteCandidates([]);
            setIsInviteCandidatesLoading(false);
            setInviteCandidatesError(null);
            setIsMemberInputFocused(false);
            setIsMemberNameComposing(false);
        } else {
            setIsVisible(false);
            document.body.style.overflow = 'unset';

            const timer = setTimeout(() => {
                setIsMounted(false);
            }, 300);
            return () => clearTimeout(timer);
        }

        return () => {
            document.body.style.overflow = 'unset';
        };
    }, [isCreateProjectModalOpen]);

    useEffect(() => {
        if (!isCreateProjectModalOpen || !isAuthenticated || !user?.id) {
            return;
        }

        let isCancelled = false;

        const loadInviteCandidates = async () => {
            setIsInviteCandidatesLoading(true);
            setInviteCandidatesError(null);

            try {
                const rows = await listChatUsers(user.id);
                if (isCancelled) {
                    return;
                }
                setAllInviteCandidates(rows.filter((member) => member.userId !== user.id));
            } catch (error) {
                if (isCancelled) {
                    return;
                }
                setAllInviteCandidates([]);
                if (isAnomalyBlockedError(error)) {
                    setInviteCandidatesError(null);
                    return;
                }
                setInviteCandidatesError(toErrorMessage(error, '초대 가능한 사용자 목록을 불러오지 못했습니다.'));
            } finally {
                if (!isCancelled) {
                    setIsInviteCandidatesLoading(false);
                }
            }
        };

        void loadInviteCandidates();

        return () => {
            isCancelled = true;
        };
    }, [isAuthenticated, isCreateProjectModalOpen, user?.id]);

    const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        const nativeEvent = e.nativeEvent as KeyboardEvent & { isComposing?: boolean };

        if (isTagComposing || nativeEvent.isComposing || e.key !== 'Enter') {
            return;
        }

        e.preventDefault();
        const newTag = tagInput.trim();
        if (newTag && !formData.tags.includes(newTag)) {
            setFormData((prev) => ({ ...prev, tags: [...prev.tags, newTag] }));
            setTagInput('');
        }
    };

    const removeTag = (tagToRemove: string) => {
        setFormData((prev) => ({ ...prev, tags: prev.tags.filter((tag) => tag !== tagToRemove) }));
    };

    const filteredInviteCandidates = useMemo(() => {
        const query = normalizeSearchKeyword(memberNameInput);
        if (!query) {
            return [] as ChatUserItem[];
        }

        const selectedUserIdSet = new Set(formData.initialMembers.map((member) => member.userId));

        return allInviteCandidates
            .filter((candidate) => {
                if (!candidate.userId || selectedUserIdSet.has(candidate.userId)) {
                    return false;
                }
                return matchesCandidateName(query, candidate);
            })
            .slice(0, 12);
    }, [allInviteCandidates, formData.initialMembers, memberNameInput]);

    const showInviteSuggestions = isMemberInputFocused && memberNameInput.trim().length > 0;

    const handleSelectInitialMember = (candidate: ChatUserItem) => {
        const isDuplicated = formData.initialMembers.some((member) => member.userId === candidate.userId);
        if (isDuplicated) {
            setMemberNameInput('');
            return;
        }

        setFormData((prev) => ({
            ...prev,
            initialMembers: [
                ...prev.initialMembers,
                {
                    name: `${getCandidateFullName(candidate)}(${getCandidateNickname(candidate)})`,
                    email: candidate.email,
                    userId: candidate.userId,
                },
            ],
        }));
        setMemberNameInput('');
    };

    const handleMemberNameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        const nativeEvent = e.nativeEvent as KeyboardEvent & { isComposing?: boolean };
        if (isMemberNameComposing || nativeEvent.isComposing || e.key !== 'Enter') {
            return;
        }

        e.preventDefault();
        if (filteredInviteCandidates.length === 0) {
            alert('초대할 멤버는 목록에서 선택해 주세요.');
            return;
        }

        handleSelectInitialMember(filteredInviteCandidates[0]);
    };

    const removeInitialMember = (index: number) => {
        setFormData((prev) => ({
            ...prev,
            initialMembers: prev.initialMembers.filter((_, memberIndex) => memberIndex !== index),
        }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!isAuthenticated || !user) {
            alert('로그인 후 프로젝트를 생성해 주세요.');
            return;
        }

        if (memberNameInput.trim()) {
            alert('초대할 멤버는 자동완성 목록에서 선택해 추가해 주세요.');
            return;
        }

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
            initialMembers: formData.initialMembers.map((member) => ({
                name: member.name,
                email: member.email,
                userId: member.userId,
            })),
        };

        try {
            setIsSubmitting(true);
            await addProject(payload, {
                userId: user.id,
                email: user.email ?? '',
                displayName,
            });
            alert('프로젝트가 생성되었습니다!');
            closeCreateProjectModal();
        } catch (error) {
            alert(toErrorMessage(error, '프로젝트 생성에 실패했습니다.'));
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!isMounted) return null;

    const modalAnimationClass = isVisible
        ? "translate-y-0 opacity-100 scale-100"
        : "translate-y-full opacity-0 scale-95";

    const backdropAnimationClass = isVisible
        ? "opacity-100"
        : "opacity-0";

    return createPortal(
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6 key-modal-container">
            <div
                className={clsx(
                    "fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-300 ease-out cursor-pointer",
                    backdropAnimationClass
                )}
                onClick={closeCreateProjectModal}
                aria-hidden="true"
            />

            <div className={clsx(
                "relative bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden transition-all duration-300 ease-out transform",
                modalAnimationClass
            )}>
                <div className="flex items-center justify-between px-6 py-4 border-b border-[#EED7DB] bg-[#FFF8F9]">
                    <h2 className="text-xl font-bold text-[#5E4246]">새 프로젝트 생성</h2>
                    <button
                        onClick={closeCreateProjectModal}
                        className="p-2 hover:bg-[#FCEBF0] rounded-full text-[#A8646E] transition-colors cursor-pointer"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    <form id="create-project-form" onSubmit={handleSubmit} className="space-y-6">
                        <div className="space-y-3">
                            <label className="block text-sm font-semibold text-[#5E4246] flex items-center">
                                <Briefcase className="w-4 h-4 mr-2" style={{ color: formData.themeColor }} />
                                프로젝트 분류 (말머리) <span className="text-red-500 ml-1">*</span>
                            </label>
                            <input
                                type="text"
                                required
                                className="w-full px-4 py-3 bg-[#FFF8F9] border border-[#EED7DB] rounded-lg focus:ring-2 focus:outline-none text-gray-900 placeholder:text-gray-400"
                                style={getRingColorStyle(formData.themeColor)}
                                placeholder="예: 기획, 디자인, 개발"
                                value={formData.category}
                                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                            />
                        </div>

                        <div className="space-y-3">
                            <label className="block text-sm font-semibold text-[#5E4246] flex items-center">
                                <Type className="w-4 h-4 mr-2" style={{ color: formData.themeColor }} />
                                프로젝트 이름 <span className="text-red-500 ml-1">*</span>
                            </label>
                            <input
                                type="text"
                                required
                                className="w-full px-4 py-3 bg-[#FFF8F9] border border-[#EED7DB] rounded-lg focus:ring-2 focus:outline-none text-gray-900 placeholder:text-gray-400"
                                style={getRingColorStyle(formData.themeColor)}
                                placeholder="프로젝트 명칭을 입력하세요"
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            />
                        </div>

                        <div className="space-y-3">
                            <label className="block text-sm font-semibold text-[#5E4246] flex items-center">
                                <AlignLeft className="w-4 h-4 mr-2" style={{ color: formData.themeColor }} />
                                프로젝트 요약
                            </label>
                            <textarea
                                rows={4}
                                className="w-full px-4 py-3 bg-[#FFF8F9] border border-[#EED7DB] rounded-lg focus:ring-2 focus:outline-none text-gray-900 placeholder:text-gray-400"
                                style={getRingColorStyle(formData.themeColor)}
                                placeholder="이 프로젝트의 목적과 내용을 간단히 적어주세요."
                                value={formData.description}
                                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                            />
                        </div>

                        <div className="space-y-3">
                            <label className="block text-sm font-semibold text-[#5E4246] flex items-center">
                                <Palette className="w-4 h-4 mr-2" style={{ color: formData.themeColor }} />
                                테마 색상
                            </label>
                            <div className="flex gap-3 flex-wrap">
                                {THEME_COLORS.map((color) => (
                                    <button
                                        type="button"
                                        key={color.name}
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

                        <div className="space-y-3">
                            <label className="block text-sm font-semibold text-[#5E4246] flex items-center">
                                <Users className="w-4 h-4 mr-2" style={{ color: formData.themeColor }} />
                                참여자 부서(태그)
                            </label>
                            <input
                                type="text"
                                className="w-full px-4 py-3 bg-[#FFF8F9] border border-[#EED7DB] rounded-lg focus:ring-2 focus:outline-none transition-all placeholder-gray-400 text-gray-900"
                                style={getRingColorStyle(formData.themeColor)}
                                placeholder="예: 기획, 백엔드, 디자인"
                                value={tagInput}
                                onCompositionStart={() => setIsTagComposing(true)}
                                onCompositionEnd={() => setIsTagComposing(false)}
                                onChange={(e) => setTagInput(e.target.value)}
                                onKeyDown={handleTagKeyDown}
                            />
                            <div className="flex flex-wrap gap-2">
                                {formData.tags.map((tag, index) => (
                                    <span
                                        key={index}
                                        className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium text-white shadow-sm"
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

                        <div className="space-y-3">
                            <label className="block text-sm font-semibold text-[#5E4246] flex items-center">
                                <Users className="w-4 h-4 mr-2" style={{ color: formData.themeColor }} />
                                초기 초대 멤버
                            </label>
                            <div className="relative">
                                <input
                                    type="text"
                                    className="w-full px-4 py-3 bg-[#FFF8F9] border border-[#EED7DB] rounded-lg focus:ring-2 focus:outline-none text-gray-900 placeholder:text-gray-400"
                                    style={getRingColorStyle(formData.themeColor)}
                                    placeholder="이름/닉네임 검색 (예: 김 또는 ㄱ)"
                                    value={memberNameInput}
                                    onCompositionStart={() => setIsMemberNameComposing(true)}
                                    onCompositionEnd={() => setIsMemberNameComposing(false)}
                                    onChange={(e) => setMemberNameInput(e.target.value)}
                                    onKeyDown={handleMemberNameKeyDown}
                                    onFocus={() => setIsMemberInputFocused(true)}
                                    onBlur={() => setIsMemberInputFocused(false)}
                                />

                                {showInviteSuggestions && (
                                    <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-56 overflow-y-auto rounded-lg border border-[#EED7DB] bg-white shadow-lg">
                                        {isInviteCandidatesLoading ? (
                                            <p className="px-3 py-2 text-xs text-gray-500">사용자 목록을 불러오는 중입니다.</p>
                                        ) : inviteCandidatesError ? (
                                            <p className="px-3 py-2 text-xs text-red-600">{inviteCandidatesError}</p>
                                        ) : filteredInviteCandidates.length === 0 ? (
                                            <p className="px-3 py-2 text-xs text-gray-500">일치하는 사용자가 없습니다.</p>
                                        ) : (
                                            <ul className="py-1">
                                                {filteredInviteCandidates.map((candidate) => (
                                                    <li key={candidate.userId}>
                                                        <button
                                                            type="button"
                                                            onMouseDown={(event) => event.preventDefault()}
                                                            onClick={() => handleSelectInitialMember(candidate)}
                                                            className="w-full px-3 py-2 text-left text-sm text-gray-800 hover:bg-[#FFF3F6] cursor-pointer"
                                                        >
                                                            {formatCandidateLabel(candidate)}
                                                        </button>
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                    </div>
                                )}
                            </div>
                            <div className="flex items-center justify-between">
                                <p className="text-xs text-gray-500">목록에서 선택한 사용자만 초기 초대 멤버로 추가됩니다.</p>
                            </div>
                            <div className="flex flex-wrap gap-2 min-h-8">
                                {formData.initialMembers.length === 0 && (
                                    <p className="text-xs text-gray-400">아직 추가된 초대 멤버가 없습니다.</p>
                                )}
                                {formData.initialMembers.map((member, index) => (
                                    <span
                                        key={`${member.userId}-${index}`}
                                        className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium text-white"
                                        style={{ backgroundColor: formData.themeColor }}
                                    >
                                        {member.name} - {member.email}
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

                        <div className="space-y-3">
                            <label className="block text-sm font-semibold text-[#5E4246] flex items-center">
                                <Calendar className="w-4 h-4 mr-2" style={{ color: formData.themeColor }} />
                                기간 설정 (선택)
                            </label>
                            <div className="flex flex-col md:flex-row gap-4">
                                <input
                                    type="date"
                                    className="w-full px-4 py-3 bg-[#FFF8F9] border border-[#EED7DB] rounded-lg focus:ring-2 focus:outline-none text-gray-900"
                                    style={getRingColorStyle(formData.themeColor)}
                                    value={formData.startDate}
                                    onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                                />
                                <span className="self-center text-gray-400">~</span>
                                <input
                                    type="date"
                                    className="w-full px-4 py-3 bg-[#FFF8F9] border border-[#EED7DB] rounded-lg focus:ring-2 focus:outline-none text-gray-900"
                                    style={getRingColorStyle(formData.themeColor)}
                                    value={formData.endDate}
                                    onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                                />
                            </div>
                        </div>

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
                                        <Globe className={`w-5 h-5 mr-2 ${formData.visibility === 'public' ? 'text-black' : 'text-gray-400'}`} />
                                        <span className={`font-semibold ${formData.visibility === 'public' ? 'text-black' : 'text-gray-600'}`}>전체 공개</span>
                                    </div>
                                    <p className={`text-xs pl-7 ${formData.visibility === 'public' ? 'text-black' : 'text-gray-500'}`}>모든 사용자가 볼 수 있습니다.</p>
                                </button>

                                <button
                                    type="button"
                                    onClick={() => setFormData({ ...formData, visibility: 'private' })}
                                    className={`p-4 rounded-lg border text-left transition-all ${formData.visibility === 'private' ? 'bg-[#FFF0F3]' : 'border-[#EED7DB] hover:bg-gray-50'} cursor-pointer`}
                                    style={{ borderColor: formData.visibility === 'private' ? formData.themeColor : undefined }}
                                >
                                    <div className="flex items-center mb-1">
                                        <Lock className={`w-5 h-5 mr-2 ${formData.visibility === 'private' ? 'text-black' : 'text-gray-400'}`} />
                                        <span className={`font-semibold ${formData.visibility === 'private' ? 'text-black' : 'text-gray-600'}`}>비공개</span>
                                    </div>
                                    <p className={`text-xs pl-7 ${formData.visibility === 'private' ? 'text-black' : 'text-gray-500'}`}>초대된 멤버만 접근할 수 있습니다.</p>
                                </button>
                            </div>
                        </div>
                    </form>
                </div>

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
