'use client';

import React, { useEffect, useState } from 'react';
import { Chrome, MessageCircle, Loader2, AlertTriangle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { toErrorMessage } from '@/lib/api/errors';

export default function LoginPage() {
    const router = useRouter();
    const {
        isAuthReady,
        isAuthenticated,
        isOnboarded,
        signInWithGoogle,
        signInWithKakao,
    } = useAuth();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');

    useEffect(() => {
        if (!isAuthReady || !isAuthenticated) {
            return;
        }

        router.replace(isOnboarded ? '/dashboard' : '/auth/callback');
    }, [isAuthReady, isAuthenticated, isOnboarded, router]);

    const handleLogin = async (provider: 'google' | 'kakao') => {
        setErrorMessage('');
        setIsSubmitting(true);

        try {
            if (provider === 'google') {
                await signInWithGoogle();
                return;
            }

            await signInWithKakao();
        } catch (error) {
            setErrorMessage(toErrorMessage(error, `${provider === 'google' ? '구글' : '카카오'} 로그인 중 오류가 발생했습니다.`));
            setIsSubmitting(false);
        }
    };

    return (
        <div className="min-h-[70vh] max-w-lg mx-auto flex items-center justify-center px-4 py-16">
            <div className="w-full border border-[#F1D2D7] rounded-2xl bg-white shadow-sm p-6">
                <h1 className="text-2xl font-bold text-gray-900 text-center">로그인</h1>
                <p className="text-sm text-gray-500 text-center mt-2 mb-8">
                    MiniCrew를 시작하려면 소셜 계정으로 로그인하세요.
                </p>

                {errorMessage && (
                    <div className="mb-5 px-3 py-2 rounded-lg bg-red-50 border border-red-100 text-sm text-red-500 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        <span>{errorMessage}</span>
                    </div>
                )}

                <div className="space-y-3">
                    <button
                        type="button"
                        onClick={() => handleLogin('google')}
                        disabled={isSubmitting}
                        className="w-full h-12 border border-[#E0E0E0] rounded-xl bg-white text-gray-700 font-semibold flex items-center justify-center gap-3 hover:bg-gray-50 transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                        <Chrome className="w-5 h-5 text-[#4285F4]" />
                        <span>Google로 로그인</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => handleLogin('kakao')}
                        disabled={isSubmitting}
                        className="w-full h-12 rounded-xl bg-[#FEE500] text-[#191919] font-semibold flex items-center justify-center gap-3 hover:brightness-95 transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                        <MessageCircle className="w-5 h-5" />
                        <span>카카오로 로그인</span>
                    </button>
                </div>

                {!isAuthReady && (
                    <p className="text-xs text-gray-400 text-center mt-6 flex items-center justify-center gap-1">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        인증 상태를 확인하고 있습니다...
                    </p>
                )}
            </div>
        </div>
    );
}
