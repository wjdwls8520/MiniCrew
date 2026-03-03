'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Camera, CheckCircle2, AlertTriangle, Loader2, UserRound } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { getDefaultProfileAvatar } from '@/lib/profileAvatar';
import { getUserProfile, getSignupNameFromUser } from '@/lib/api/auth';
import { useAuth } from '@/context/AuthContext';
import { toErrorMessage } from '@/lib/api/errors';
import { cleanupStoredImagePathSafely, uploadOptimizedImage, PROFILE_IMAGE_MAX_BYTES } from '@/lib/storage/imageUpload';

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

export default function AuthCallbackPage() {
    const router = useRouter();
    const { createUserProfile, refreshProfile } = useAuth();
    const [status, setStatus] = useState<'loading' | 'signup' | 'error'>('loading');
    const [errorMessage, setErrorMessage] = useState('');
    const [userId, setUserId] = useState('');
    const [email, setEmail] = useState('');
    const [name, setName] = useState('');
    const [nickname, setNickname] = useState('');
    const [phoneNumber, setPhoneNumber] = useState('');
    const [avatarUrl, setAvatarUrl] = useState<string>(getDefaultProfileAvatar());
    const [avatarFile, setAvatarFile] = useState<File | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const avatarObjectUrlRef = useRef<string | null>(null);

    useEffect(() => {
        const init = async () => {
            setStatus('loading');
            setErrorMessage('');
            const rawQuery = window.location.search || '';
            const rawHash = window.location.hash || '';

            try {
                const searchParams = new URLSearchParams(window.location.search);
                const providerError = searchParams.get('error');
                const providerErrorDescription = searchParams.get('error_description');
                if (providerError) {
                    throw new Error(providerErrorDescription ? `${providerError}: ${providerErrorDescription}` : providerError);
                }

                let session = null;

                const current = await supabase.auth.getSession();
                if (current.data.session) {
                    session = current.data.session;
                } else {
                    const codeFromQuery = searchParams.get('code');
                    if (codeFromQuery) {
                        const exchangeResult = await supabase.auth.exchangeCodeForSession(codeFromQuery);
                        if (exchangeResult.error) {
                            throw exchangeResult.error;
                        }

                        session = exchangeResult.data.session;
                    }

                    if (!session) {
                        const hashParams = new URLSearchParams(window.location.hash.slice(1));
                        const accessToken = hashParams.get('access_token');
                        const refreshToken = hashParams.get('refresh_token');

                        if (accessToken && refreshToken) {
                            const setSessionResult = await supabase.auth.setSession({
                                access_token: accessToken,
                                refresh_token: refreshToken,
                            });

                            if (setSessionResult.error) {
                                throw setSessionResult.error;
                            }

                            session = setSessionResult.data.session;
                        }
                    }
                }

                if (!session) {
                    throw new Error(
                        'OAuth 콜백 세션이 없습니다. Google/Kakao OAuth redirect URI 또는 쿠키/세션 저장 정책을 확인해 주세요.'
                    );
                }

                const profile = await getUserProfile(session.user.id);
                if (profile) {
                    try {
                        await refreshProfile(session.user.id);
                    } catch {
                        // 이미 가입된 사용자로 간주하고 진입
                    }

                    router.replace('/dashboard');
                    return;
                }

                setUserId(session.user.id);
                setEmail(session.user.email ?? '');
                const signupName = getSignupNameFromUser(session.user);
                setName(signupName);
                setNickname(signupName);

                const metadata = session.user.user_metadata ?? {};
                const providerAvatar = typeof metadata.avatar_url === 'string' ? metadata.avatar_url.trim() : '';
                setAvatarUrl(providerAvatar || getDefaultProfileAvatar());

                setStatus('signup');
            } catch (error) {
                const fallbackError = toErrorMessage(error, '로그인 후 처리 중 문제가 발생했습니다.');
                const code = new URLSearchParams(rawQuery).get('code');
                const errorDetail = error instanceof Error ? error.message : String(error ?? '');
                setErrorMessage(
                    `${fallbackError}\n\n원인: ${errorDetail}${code ? `\n(code: ${code.slice(0, 10)}...)` : ''}\n\n쿼리: ${rawQuery}\n해시: ${rawHash || '(없음)'}`
                );
                setStatus('error');
            }
        };

        void init();
    }, [router, refreshProfile]);

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

        if (file.type.startsWith('video/')) {
            setErrorMessage('영상 파일은 업로드할 수 없습니다.');
            return;
        }

        if (!file.type.startsWith('image/')) {
            setErrorMessage('이미지 파일만 업로드할 수 있습니다.');
            return;
        }

        if (file.size > PROFILE_IMAGE_MAX_BYTES) {
            alert('프로필 이미지는 500KB 기준으로 자동 최적화되며 화질 저하가 발생할 수 있습니다.');
        }

        if (avatarObjectUrlRef.current) {
            URL.revokeObjectURL(avatarObjectUrlRef.current);
            avatarObjectUrlRef.current = null;
        }

        const objectUrl = URL.createObjectURL(file);
        avatarObjectUrlRef.current = objectUrl;
        setAvatarFile(file);
        setAvatarUrl(objectUrl);
        setErrorMessage('');
    };

    const handlePhoneNumberChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        setPhoneNumber(formatPhoneNumberForDisplay(event.target.value));
    };

    const handleSignup = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!userId) {
            setErrorMessage('사용자 정보를 찾을 수 없습니다.');
            return;
        }

        if (!nickname.trim()) {
            setErrorMessage('닉네임은 필수로 입력해 주세요.');
            return;
        }

        let normalizedPhone = '';
        try {
            normalizedPhone = normalizePhoneNumber(phoneNumber);
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : '전화번호를 확인해 주세요.');
            return;
        }

        let uploadedAvatar: Awaited<ReturnType<typeof uploadOptimizedImage>> | null = null;
        let profileSaved = false;

        try {
            setIsSubmitting(true);
            setErrorMessage('');
            if (avatarFile) {
                uploadedAvatar = await uploadOptimizedImage({
                    file: avatarFile,
                    userId,
                    folder: 'profiles',
                });
            }

            await createUserProfile({
                userId,
                email,
                fullName: name,
                nickname,
                phoneNumber: normalizedPhone,
                avatarUrl: uploadedAvatar?.publicUrl ?? avatarUrl,
                avatarOriginalFilename: uploadedAvatar?.originalFilename ?? null,
                avatarStoredFilename: uploadedAvatar?.storedFilename ?? null,
                avatarStoragePath: uploadedAvatar?.storagePath ?? null,
                avatarSizeBytes: uploadedAvatar?.sizeBytes ?? null,
            });
            profileSaved = true;
            try {
                await refreshProfile(userId);
            } catch {
                // 프로필 저장이 완료된 경우 상세 갱신 실패로 가입 흐름을 막지 않음
            }
            router.replace('/dashboard');
        } catch (error) {
            if (!profileSaved && uploadedAvatar?.storagePath) {
                const rawErrorMessage = error instanceof Error ? error.message : String(error ?? '');
                const isNetworkUncertain = /Failed to fetch|NetworkError|timeout|timed out/i.test(rawErrorMessage);

                if (!isNetworkUncertain) {
                    void cleanupStoredImagePathSafely(uploadedAvatar.storagePath);
                } else {
                    try {
                        const maybeProfile = await getUserProfile(userId);
                        if (!maybeProfile) {
                            void cleanupStoredImagePathSafely(uploadedAvatar.storagePath);
                        }
                    } catch {
                        // 저장 여부를 판단할 수 없는 경우 파일을 유지
                    }
                }
            }

            const nextError = toErrorMessage(error, '회원정보를 저장하지 못했습니다.');
            setErrorMessage(nextError);
            if (nextError.includes('스토리지')) {
                alert(nextError);
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    if (status === 'loading') {
        return (
            <div className="min-h-[60vh] flex items-center justify-center">
                <div className="flex items-center gap-2 text-gray-500">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    로그인 처리를 진행하고 있습니다.
                </div>
            </div>
        );
    }

    if (status === 'error') {
        return (
            <div className="max-w-md mx-auto mt-16 px-4">
                <div className="border border-red-100 bg-red-50 rounded-xl p-5 text-center">
                    <div className="inline-flex w-10 h-10 rounded-full bg-red-100 text-red-500 items-center justify-center mb-3">
                        <AlertTriangle className="w-5 h-5" />
                    </div>
                    <p className="text-sm text-red-500 mb-4">{errorMessage || '로그인 처리 중 오류가 발생했습니다.'}</p>
                    <button
                        type="button"
                        onClick={() => router.replace('/login')}
                        className="px-4 py-2 bg-red-100 rounded-lg text-red-600 text-sm font-semibold"
                    >
                        로그인 화면으로 이동
                    </button>
                    <button
                        type="button"
                        onClick={() => router.replace('/')}
                        className="ml-2 px-4 py-2 border border-red-200 rounded-lg text-red-600 text-sm font-semibold"
                    >
                        홈으로
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-lg mx-auto px-4 py-16">
            <div className="border border-[#F1D2D7] rounded-2xl bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between mb-6">
                    <h1 className="text-xl font-bold text-gray-900">회원가입</h1>
                    <div className="w-9 h-9 rounded-full bg-[#B95D69] text-white flex items-center justify-center">
                        <UserRound className="w-5 h-5" />
                    </div>
                </div>

                <p className="text-sm text-gray-500 mb-6">
                    처음 로그인이라면 닉네임/전화번호/프로필 이미지를 입력해 주세요.
                    <br />
                    이메일과 이름은 로그인 계정 정보를 그대로 사용합니다.
                </p>

                {errorMessage && (
                    <div className="mb-4 px-3 py-2 rounded-lg bg-red-50 border border-red-100 text-sm text-red-500">
                        {errorMessage}
                    </div>
                )}

                <form onSubmit={handleSignup} className="space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wide">이메일</label>
                        <input
                            type="text"
                            value={email}
                            readOnly
                            className="w-full h-11 px-4 border border-gray-200 rounded-lg bg-gray-50 text-gray-700"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wide">이름</label>
                        <input
                            type="text"
                            value={name}
                            readOnly
                            className="w-full h-11 px-4 border border-gray-200 rounded-lg bg-gray-50 text-gray-700"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wide">닉네임</label>
                        <input
                            type="text"
                            value={nickname}
                            onChange={(e) => setNickname(e.target.value)}
                            placeholder="MiniCrew에서 사용할 닉네임"
                            className="w-full h-11 px-4 border border-gray-200 rounded-lg text-gray-900 placeholder:text-gray-400 focus:border-[#B95D69] focus:outline-none"
                            maxLength={30}
                        />
                        <p className="mt-1 text-xs text-gray-400">30자 이내</p>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wide">전화번호</label>
                        <input
                            type="text"
                            value={phoneNumber}
                            onChange={handlePhoneNumberChange}
                            placeholder="예: 010-1234-5678"
                            inputMode="numeric"
                            autoComplete="tel-national"
                            maxLength={18}
                            className="w-full h-11 px-4 border border-gray-200 rounded-lg text-gray-900 placeholder:text-gray-400 focus:border-[#B95D69] focus:outline-none"
                        />
                        <p className="mt-1 text-xs text-gray-400">
                            한국 번호는 010-1234-5678/02-1234-5678 형식으로 자동 하이픈 처리되며, 해외 번호도 최대 15자리까지 입력할 수 있습니다.
                        </p>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wide">
                            프로필 이미지
                        </label>
                        <div className="flex items-center gap-3">
                            <div className="h-14 w-14 rounded-full overflow-hidden bg-[#FFE4E8] border border-[#F1D2D7]">
                                <img src={avatarUrl} alt="프로필 미리보기" className="h-full w-full object-cover" />
                            </div>
                            <div>
                                <label
                                    htmlFor="profile-image-input"
                                    className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-[#B95D69] px-3 py-2 text-xs font-semibold text-[#8E4C58] hover:bg-[#FCEBF0]"
                                >
                                    <Camera className="h-3.5 w-3.5" />
                                    이미지 선택
                                </label>
                                <input
                                    id="profile-image-input"
                                    type="file"
                                    accept="image/*"
                                    onChange={handleAvatarChange}
                                    className="hidden"
                                />
                                <p className="mt-1 text-xs text-gray-400">선택하지 않으면 기본 이미지가 적용됩니다.</p>
                            </div>
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={isSubmitting}
                        className="w-full h-12 bg-[#B95D69] hover:bg-[#A04C58] text-white rounded-xl font-bold disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                        {isSubmitting ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                저장 중...
                            </>
                        ) : (
                            <>
                                <CheckCircle2 className="w-4 h-4" />
                                회원가입 완료하고 시작하기
                            </>
                        )}
                    </button>
                </form>
            </div>
        </div>
    );
}
