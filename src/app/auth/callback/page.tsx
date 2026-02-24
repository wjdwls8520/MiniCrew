'use client';

import React, { useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle, Loader2, UserRound } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { getUserProfile, getSignupNameFromUser } from '@/lib/api/auth';
import { useAuth } from '@/context/AuthContext';
import { toErrorMessage } from '@/lib/api/errors';

export default function AuthCallbackPage() {
    const router = useRouter();
    const { createUserProfile, refreshProfile } = useAuth();
    const [status, setStatus] = useState<'loading' | 'signup' | 'error'>('loading');
    const [errorMessage, setErrorMessage] = useState('');
    const [userId, setUserId] = useState('');
    const [email, setEmail] = useState('');
    const [name, setName] = useState('');
    const [nickname, setNickname] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        const init = async () => {
            setStatus('loading');
            setErrorMessage('');

            try {
                let session = null;

                const current = await supabase.auth.getSession();
                if (current.data.session) {
                    session = current.data.session;
                } else {
                    const callbackResult = await supabase.auth.getSessionFromUrl({ storeSession: true });
                    if (callbackResult.error) {
                        throw callbackResult.error;
                    }

                    session = callbackResult.data.session;
                }

                if (!session) {
                    throw new Error('로그인 세션을 찾을 수 없습니다.');
                }

                const profile = await getUserProfile(session.user.id);
                if (profile) {
                    try {
                        await refreshProfile(session.user.id);
                    } catch {
                        // Keep fallback behavior: 이미 가입된 사용자면 대시보드로 이동.
                    }
                    router.replace('/dashboard');
                    return;
                }

                setUserId(session.user.id);
                setEmail(session.user.email ?? '');
                const signupName = getSignupNameFromUser(session.user);
                setName(signupName);
                setNickname(signupName);
                setStatus('signup');
            } catch (error) {
                setErrorMessage(toErrorMessage(error, '로그인 후 처리 중 문제가 발생했습니다.'));
                setStatus('error');
            }
        };

        void init();
    }, [router, refreshProfile]);

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

        try {
            setIsSubmitting(true);
            setErrorMessage('');
            await createUserProfile({
                userId,
                email,
                fullName: name,
                nickname,
            });
            await refreshProfile(userId);
            router.replace('/dashboard');
        } catch (error) {
            setErrorMessage(toErrorMessage(error, '회원정보를 저장하지 못했습니다.'));
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
                    처음 로그인이라면 닉네임만 설정해 주세요. 이메일과 이름은 로그인 계정 정보를 그대로 사용합니다.
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
