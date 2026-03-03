'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bell, LogIn, LogOut, Settings, ShieldCheck, X } from 'lucide-react';
import { clsx } from 'clsx';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';

interface AppSettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

interface AppSettingsState {
    notificationSoundEnabled: boolean;
    typingIndicatorEnabled: boolean;
}

const SETTINGS_STORAGE_KEY = 'minicrew_app_settings_v1';
const DEFAULT_SETTINGS: AppSettingsState = {
    notificationSoundEnabled: true,
    typingIndicatorEnabled: true,
};

function readStoredSettings(): AppSettingsState {
    if (typeof window === 'undefined') {
        return DEFAULT_SETTINGS;
    }

    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) {
        return DEFAULT_SETTINGS;
    }

    try {
        const parsed = JSON.parse(raw) as Partial<AppSettingsState>;
        return {
            notificationSoundEnabled: parsed.notificationSoundEnabled ?? DEFAULT_SETTINGS.notificationSoundEnabled,
            typingIndicatorEnabled: parsed.typingIndicatorEnabled ?? DEFAULT_SETTINGS.typingIndicatorEnabled,
        };
    } catch {
        return DEFAULT_SETTINGS;
    }
}

function writeStoredSettings(settings: AppSettingsState): void {
    if (typeof window === 'undefined') {
        return;
    }
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}

export function AppSettingsModal({ isOpen, onClose }: AppSettingsModalProps) {
    const router = useRouter();
    const { isAuthenticated, isOnboarded, user, profile, signOut } = useAuth();
    const [settings, setSettings] = useState<AppSettingsState>(() => readStoredSettings());

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

    const toggleSetting = (key: keyof AppSettingsState) => {
        setSettings((prev) => {
            const next = { ...prev, [key]: !prev[key] };
            writeStoredSettings(next);
            return next;
        });
    };

    const handleAuthAction = async () => {
        if (!isAuthenticated) {
            onClose();
            router.push('/login');
            return;
        }

        const shouldLogout = window.confirm('로그아웃 하시겠습니까?');
        if (!shouldLogout) {
            return;
        }

        try {
            await signOut();
            onClose();
            router.push('/dashboard');
        } catch {
            window.alert('로그아웃에 실패했습니다.');
        }
    };

    if (!isOpen) {
        return null;
    }

    return createPortal(
        <div className="fixed inset-0 z-[65] flex items-center justify-center p-4 sm:p-6">
            <div
                className="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-200 cursor-pointer opacity-100"
                onClick={onClose}
                aria-hidden="true"
            />

            <div
                className={clsx(
                    'relative w-full max-w-xl max-h-[90vh] overflow-hidden rounded-xl bg-white shadow-2xl transition-all duration-200 opacity-100 scale-100'
                )}
            >
                <div className="flex items-center justify-between border-b border-[#EED7DB] bg-[#FFF8F9] px-6 py-4">
                    <h2 className="text-xl font-bold text-[#5E4246] flex items-center gap-2">
                        <Settings className="w-5 h-5 text-[#B95D69]" />
                        설정
                    </h2>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-2 rounded-full text-[#A8646E] hover:bg-[#FCEBF0] transition-colors cursor-pointer"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="max-h-[70vh] overflow-y-auto p-6 space-y-5">
                    <section className="rounded-lg border border-[#EED7DB] bg-[#FFF8F9] p-4 space-y-2">
                        <h3 className="text-sm font-semibold text-[#5E4246]">계정 상태</h3>
                        <p className="text-sm text-gray-700">
                            {isAuthenticated ? '로그인됨' : '비로그인'}
                            {isAuthenticated && !isOnboarded ? ' (회원정보 입력 필요)' : ''}
                        </p>
                        {isAuthenticated && (
                            <>
                                <p className="text-xs text-gray-500 break-all">이메일: {profile?.email ?? user?.email ?? '-'}</p>
                                <p className="text-xs text-gray-500">이름: {profile?.fullName ?? '-'}</p>
                                <p className="text-xs text-gray-500">닉네임: {profile?.nickname ?? '-'}</p>
                            </>
                        )}
                    </section>

                    <section className="rounded-lg border border-[#EED7DB] bg-white p-4 space-y-3">
                        <h3 className="text-sm font-semibold text-[#5E4246] flex items-center gap-2">
                            <Bell className="w-4 h-4 text-[#B95D69]" />
                            알림 및 표시
                        </h3>

                        <button
                            type="button"
                            onClick={() => toggleSetting('notificationSoundEnabled')}
                            className="w-full rounded-lg border border-[#EED7DB] px-3 py-2.5 text-left text-sm text-gray-700 hover:bg-[#FFF8F9] transition-colors cursor-pointer"
                        >
                            알림 소리: {settings.notificationSoundEnabled ? '사용' : '미사용'}
                        </button>

                        <button
                            type="button"
                            onClick={() => toggleSetting('typingIndicatorEnabled')}
                            className="w-full rounded-lg border border-[#EED7DB] px-3 py-2.5 text-left text-sm text-gray-700 hover:bg-[#FFF8F9] transition-colors cursor-pointer"
                        >
                            채팅 입력중 표시: {settings.typingIndicatorEnabled ? '사용' : '미사용'}
                        </button>
                    </section>

                    <section className="rounded-lg border border-[#EED7DB] bg-white p-4 space-y-2">
                        <h3 className="text-sm font-semibold text-[#5E4246] flex items-center gap-2">
                            <ShieldCheck className="w-4 h-4 text-[#B95D69]" />
                            보안 안내
                        </h3>
                        <p className="text-xs leading-relaxed text-gray-500">
                            모든 데이터 요청은 서버 검증 후 처리됩니다. 비정상 요청이 감지되면 해당 요청은 차단됩니다.
                        </p>
                    </section>
                </div>

                <div className="border-t border-[#EED7DB] bg-[#FFF8F9] px-6 py-4 flex justify-end gap-3">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-5 py-2.5 rounded-lg border border-[#EED7DB] bg-white text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer"
                    >
                        닫기
                    </button>
                    <button
                        type="button"
                        onClick={() => void handleAuthAction()}
                        className="px-5 py-2.5 rounded-lg bg-[#B95D69] text-white hover:bg-[#A64D5A] transition-colors inline-flex items-center gap-2 cursor-pointer"
                    >
                        {isAuthenticated ? <LogOut className="w-4 h-4" /> : <LogIn className="w-4 h-4" />}
                        {isAuthenticated ? '로그아웃' : '로그인'}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}
