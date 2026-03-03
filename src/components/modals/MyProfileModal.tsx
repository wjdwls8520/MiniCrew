'use client';

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Camera, Loader2, UserRound, X } from 'lucide-react';
import { clsx } from 'clsx';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { getDefaultProfileAvatar } from '@/lib/profileAvatar';
import { cleanupStoredImagePathSafely, PROFILE_IMAGE_MAX_BYTES, uploadOptimizedImage } from '@/lib/storage/imageUpload';
import { toErrorMessage } from '@/lib/api/errors';

interface MyProfileModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const MAX_PHONE_DIGITS = 15;

function toPhoneDigits(input: string): string {
    return input.replace(/\D/g, '').slice(0, MAX_PHONE_DIGITS);
}

function formatKoreanPhoneNumber(digits: string): string {
    if (digits.startsWith('02')) {
        const limited = digits.slice(0, 10);
        if (limited.length <= 2) {
            return limited;
        }
        if (limited.length <= 5) {
            return `${limited.slice(0, 2)}-${limited.slice(2)}`;
        }
        if (limited.length <= 9) {
            return `${limited.slice(0, 2)}-${limited.slice(2, 5)}-${limited.slice(5)}`;
        }
        return `${limited.slice(0, 2)}-${limited.slice(2, 6)}-${limited.slice(6)}`;
    }

    const limited = digits.slice(0, 11);
    if (limited.length <= 3) {
        return limited;
    }
    if (limited.length <= 6) {
        return `${limited.slice(0, 3)}-${limited.slice(3)}`;
    }
    if (limited.length <= 10) {
        return `${limited.slice(0, 3)}-${limited.slice(3, 6)}-${limited.slice(6)}`;
    }
    return `${limited.slice(0, 3)}-${limited.slice(3, 7)}-${limited.slice(7)}`;
}

function formatInternationalPhoneNumber(digits: string): string {
    const limited = digits.slice(0, MAX_PHONE_DIGITS);
    if (limited.length <= 3) {
        return limited;
    }
    if (limited.length <= 6) {
        return `${limited.slice(0, 3)}-${limited.slice(3)}`;
    }
    if (limited.length <= 10) {
        return `${limited.slice(0, 3)}-${limited.slice(3, 6)}-${limited.slice(6)}`;
    }
    if (limited.length <= 11) {
        return `${limited.slice(0, 3)}-${limited.slice(3, 7)}-${limited.slice(7)}`;
    }
    return `${limited.slice(0, 3)}-${limited.slice(3, 7)}-${limited.slice(7, 11)}-${limited.slice(11)}`;
}

function formatPhoneNumberForDisplay(input: string): string {
    const digits = toPhoneDigits(input);
    if (!digits) {
        return '';
    }
    if (digits.startsWith('0')) {
        return formatKoreanPhoneNumber(digits);
    }
    return formatInternationalPhoneNumber(digits);
}

function normalizePhoneNumber(input: string): string {
    const normalized = toPhoneDigits(input);
    if (!normalized) {
        throw new Error('전화번호를 입력해 주세요.');
    }
    if (normalized.length < 8) {
        throw new Error('전화번호 형식이 올바르지 않습니다.');
    }
    return normalized;
}

function getUserFullName(user: { user_metadata?: { full_name?: unknown; name?: unknown }; email?: string | null } | null): string {
    if (!user) {
        return '';
    }

    const fullName =
        typeof user.user_metadata?.full_name === 'string'
            ? user.user_metadata.full_name
            : typeof user.user_metadata?.name === 'string'
                ? user.user_metadata.name
                : '';
    const normalizedFullName = fullName.trim();
    if (normalizedFullName) {
        return normalizedFullName;
    }

    if (user.email) {
        return user.email.split('@')[0] ?? '';
    }

    return '';
}

export function MyProfileModal({ isOpen, onClose }: MyProfileModalProps) {
    const router = useRouter();
    const { user, profile, isAuthenticated, createUserProfile, refreshProfile } = useAuth();
    const [isMounted, setIsMounted] = useState(false);
    const [isVisible, setIsVisible] = useState(false);
    const [nickname, setNickname] = useState('');
    const [phoneNumber, setPhoneNumber] = useState('');
    const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string>(getDefaultProfileAvatar());
    const [avatarFile, setAvatarFile] = useState<File | null>(null);
    const [errorMessage, setErrorMessage] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const avatarObjectUrlRef = useRef<string | null>(null);

    useEffect(() => {
        if (!isOpen) {
            setIsVisible(false);
            return;
        }

        setIsMounted(true);
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        const initialNickname = profile?.nickname?.trim() || '';
        const initialPhone = profile?.phoneNumber?.trim() || '';
        const initialAvatar = profile?.avatarUrl?.trim() || getDefaultProfileAvatar();

        setNickname(initialNickname);
        setPhoneNumber(formatPhoneNumberForDisplay(initialPhone));
        setAvatarPreviewUrl(initialAvatar);
        setAvatarFile(null);
        setErrorMessage('');

        requestAnimationFrame(() => {
            requestAnimationFrame(() => setIsVisible(true));
        });

        return () => {
            document.body.style.overflow = previousOverflow;
        };
    }, [isOpen, profile]);

    useEffect(() => {
        if (isOpen || !isMounted) {
            return;
        }

        const timer = window.setTimeout(() => {
            setIsMounted(false);
        }, 220);

        return () => window.clearTimeout(timer);
    }, [isMounted, isOpen]);

    useEffect(() => {
        return () => {
            if (avatarObjectUrlRef.current) {
                URL.revokeObjectURL(avatarObjectUrlRef.current);
                avatarObjectUrlRef.current = null;
            }
        };
    }, []);

    const handleAvatarChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) {
            return;
        }

        if (!file.type.startsWith('image/')) {
            setErrorMessage('이미지 파일만 업로드할 수 있습니다.');
            return;
        }

        if (file.size > PROFILE_IMAGE_MAX_BYTES) {
            window.alert('프로필 이미지는 500KB 기준으로 자동 최적화되며 화질 저하가 발생할 수 있습니다.');
        }

        if (avatarObjectUrlRef.current) {
            URL.revokeObjectURL(avatarObjectUrlRef.current);
            avatarObjectUrlRef.current = null;
        }

        const objectUrl = URL.createObjectURL(file);
        avatarObjectUrlRef.current = objectUrl;
        setAvatarFile(file);
        setAvatarPreviewUrl(objectUrl);
        setErrorMessage('');
    };

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!isAuthenticated || !user) {
            onClose();
            router.push('/login');
            return;
        }

        if (!nickname.trim()) {
            setErrorMessage('닉네임을 입력해 주세요.');
            return;
        }

        let normalizedPhoneNumber = '';
        try {
            normalizedPhoneNumber = normalizePhoneNumber(phoneNumber);
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : '전화번호를 확인해 주세요.');
            return;
        }

        let uploadedAvatar: Awaited<ReturnType<typeof uploadOptimizedImage>> | null = null;
        let profileSaved = false;
        const previousAvatarStoragePath = profile?.avatarStoragePath?.trim() || null;

        try {
            setIsSubmitting(true);
            setErrorMessage('');

            if (avatarFile) {
                uploadedAvatar = await uploadOptimizedImage({
                    file: avatarFile,
                    userId: user.id,
                    folder: 'profiles',
                });
            }

            const nextAvatarUrl = uploadedAvatar?.publicUrl ?? profile?.avatarUrl ?? getDefaultProfileAvatar();

            await createUserProfile({
                userId: user.id,
                email: profile?.email ?? user.email ?? '',
                fullName: profile?.fullName ?? getUserFullName(user),
                nickname: nickname.trim(),
                phoneNumber: normalizedPhoneNumber,
                avatarUrl: nextAvatarUrl,
                avatarOriginalFilename: uploadedAvatar?.originalFilename ?? profile?.avatarOriginalFilename ?? null,
                avatarStoredFilename: uploadedAvatar?.storedFilename ?? profile?.avatarStoredFilename ?? null,
                avatarStoragePath: uploadedAvatar?.storagePath ?? profile?.avatarStoragePath ?? null,
                avatarSizeBytes: uploadedAvatar?.sizeBytes ?? profile?.avatarSizeBytes ?? null,
            });
            profileSaved = true;

            await refreshProfile(user.id);

            if (uploadedAvatar?.storagePath && previousAvatarStoragePath && uploadedAvatar.storagePath !== previousAvatarStoragePath) {
                void cleanupStoredImagePathSafely(previousAvatarStoragePath);
            }

            onClose();
        } catch (error) {
            if (!profileSaved && uploadedAvatar?.storagePath) {
                void cleanupStoredImagePathSafely(uploadedAvatar.storagePath);
            }
            setErrorMessage(toErrorMessage(error, '프로필 저장에 실패했습니다.'));
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!isMounted) {
        return null;
    }

    const email = profile?.email ?? user?.email ?? '-';
    const fullName = profile?.fullName || getUserFullName(user) || '-';
    const backdropClass = isVisible ? 'opacity-100' : 'opacity-0';
    const panelClass = isVisible ? 'translate-y-0 opacity-100 scale-100' : 'translate-y-full opacity-0 scale-95';

    return createPortal(
        <div className="fixed inset-0 z-[65] flex items-center justify-center p-4 sm:p-6">
            <div
                className={clsx(
                    'fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-200 cursor-pointer',
                    backdropClass
                )}
                onClick={onClose}
                aria-hidden="true"
            />

            <div
                className={clsx(
                    'relative w-full max-w-2xl max-h-[90vh] overflow-hidden rounded-xl bg-white shadow-2xl transition-all duration-200',
                    panelClass
                )}
            >
                <div className="flex items-center justify-between border-b border-[#EED7DB] bg-[#FFF8F9] px-6 py-4">
                    <h2 className="text-xl font-bold text-[#5E4246]">마이페이지</h2>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-2 rounded-full text-[#A8646E] hover:bg-[#FCEBF0] transition-colors cursor-pointer"
                        disabled={isSubmitting}
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <form id="my-profile-form" onSubmit={handleSubmit} className="max-h-[70vh] overflow-y-auto p-6 space-y-5">
                    <div className="flex flex-col items-center gap-3">
                        <div className="relative">
                            <div className="w-24 h-24 rounded-full overflow-hidden border border-[#EED7DB] bg-[#FFF8F9]">
                                {avatarPreviewUrl ? (
                                    <img
                                        src={avatarPreviewUrl}
                                        alt="프로필 이미지"
                                        className="w-full h-full object-cover"
                                    />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-[#B95D69]">
                                        <UserRound className="w-10 h-10" />
                                    </div>
                                )}
                            </div>
                            <label
                                htmlFor="profile-avatar-upload"
                                className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-[#B95D69] text-white flex items-center justify-center shadow-md hover:bg-[#A64D5A] cursor-pointer"
                                title="프로필 이미지 변경"
                            >
                                <Camera className="w-4 h-4" />
                            </label>
                            <input
                                id="profile-avatar-upload"
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={handleAvatarChange}
                                disabled={isSubmitting}
                            />
                        </div>
                        <p className="text-xs text-gray-500">500KB를 초과한 이미지는 자동 최적화됩니다.</p>
                    </div>

                    <div className="space-y-3">
                        <label className="block text-sm font-semibold text-[#5E4246]">이메일</label>
                        <input
                            type="email"
                            value={email}
                            disabled
                            className="w-full px-4 py-3 rounded-lg border border-[#EED7DB] bg-gray-50 text-gray-500"
                        />
                    </div>

                    <div className="space-y-3">
                        <label className="block text-sm font-semibold text-[#5E4246]">이름</label>
                        <input
                            type="text"
                            value={fullName}
                            disabled
                            className="w-full px-4 py-3 rounded-lg border border-[#EED7DB] bg-gray-50 text-gray-500"
                        />
                    </div>

                    <div className="space-y-3">
                        <label className="block text-sm font-semibold text-[#5E4246]">닉네임</label>
                        <input
                            type="text"
                            value={nickname}
                            onChange={(event) => setNickname(event.target.value)}
                            disabled={isSubmitting}
                            className="w-full px-4 py-3 rounded-lg border border-[#EED7DB] bg-[#FFF8F9] focus:ring-2 focus:ring-[#B95D69] focus:outline-none text-gray-900 placeholder:text-gray-400"
                            placeholder="닉네임 입력"
                            maxLength={30}
                        />
                    </div>

                    <div className="space-y-3">
                        <label className="block text-sm font-semibold text-[#5E4246]">전화번호</label>
                        <input
                            type="tel"
                            value={phoneNumber}
                            onChange={(event) => setPhoneNumber(formatPhoneNumberForDisplay(event.target.value))}
                            disabled={isSubmitting}
                            className="w-full px-4 py-3 rounded-lg border border-[#EED7DB] bg-[#FFF8F9] focus:ring-2 focus:ring-[#B95D69] focus:outline-none text-gray-900 placeholder:text-gray-400"
                            placeholder="010-1234-5678"
                            inputMode="numeric"
                        />
                    </div>

                    {errorMessage && (
                        <p className="text-sm text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                            {errorMessage}
                        </p>
                    )}
                </form>

                <div className="border-t border-[#EED7DB] bg-[#FFF8F9] h-16 px-6 flex items-center justify-end gap-3">
                    <button
                        type="button"
                        onClick={onClose}
                        className="m-0 p-0 h-11 min-w-[92px] rounded-lg border border-[#EED7DB] bg-white text-sm font-medium leading-none text-gray-700 hover:bg-gray-50 transition-colors inline-flex items-center justify-center cursor-pointer"
                        disabled={isSubmitting}
                    >
                        취소
                    </button>
                    <button
                        type="submit"
                        form="my-profile-form"
                        className="m-0 p-0 h-11 min-w-[92px] rounded-lg bg-[#B95D69] text-sm font-medium leading-none text-white hover:bg-[#A64D5A] transition-colors inline-flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer"
                        disabled={isSubmitting}
                    >
                        {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                        저장
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}
