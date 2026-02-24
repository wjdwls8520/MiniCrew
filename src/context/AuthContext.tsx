'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { getDisplayNameFromUser, getUserProfile, upsertUserProfile } from '@/lib/api/auth';
import type { UserProfile } from '@/types/auth';

interface AuthContextType {
    isAuthReady: boolean;
    user: User | null;
    profile: UserProfile | null;
    displayName: string;
    isAuthenticated: boolean;
    signInWithGoogle: () => Promise<void>;
    signInWithKakao: () => Promise<void>;
    signOut: () => Promise<void>;
    refreshProfile: (nextUserId?: string | null) => Promise<UserProfile | null>;
    createUserProfile: (params: {
        userId: string;
        email: string;
        fullName: string;
        nickname: string;
    }) => Promise<UserProfile>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [isAuthReady, setIsAuthReady] = useState(false);
    const [user, setUser] = useState<User | null>(null);
    const [profile, setProfile] = useState<UserProfile | null>(null);

    const refreshProfile = useCallback(async (nextUserId?: string | null): Promise<UserProfile | null> => {
        const targetUserId = nextUserId || user?.id || null;
        if (!targetUserId) {
            setProfile(null);
            return null;
        }

        const nextProfile = await getUserProfile(targetUserId);
        setProfile(nextProfile);
        return nextProfile;
    }, [user]);

    const syncSessionAndProfile = useCallback(async () => {
        const { data, error } = await supabase.auth.getSession();
        if (error) {
            setUser(null);
            setProfile(null);
            setIsAuthReady(true);
            return;
        }

        setUser(data.session?.user ?? null);
        if (!data.session?.user) {
            setProfile(null);
        } else {
            try {
                const nextProfile = await getUserProfile(data.session.user.id);
                setProfile(nextProfile);
            } catch {
                setProfile(null);
            }
        }

        setIsAuthReady(true);
    }, []);

    const signInWithGoogle = useCallback(async () => {
        const redirectTo = `${window.location.origin}/auth/callback`;

        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: { redirectTo },
        });

        if (error) {
            throw error;
        }
    }, []);

    const signInWithKakao = useCallback(async () => {
        const redirectTo = `${window.location.origin}/auth/callback`;

        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'kakao',
            options: { redirectTo },
        });

        if (error) {
            throw error;
        }
    }, []);

    const signOut = useCallback(async () => {
        const { error } = await supabase.auth.signOut();
        if (error) {
            throw error;
        }
        setUser(null);
        setProfile(null);
    }, []);

    const createUserProfile = useCallback(async (params: {
        userId: string;
        email: string;
        fullName: string;
        nickname: string;
    }) => {
        const nextProfile = await upsertUserProfile(params);
        if (user?.id === params.userId) {
            setProfile(nextProfile);
        }
        return nextProfile;
    }, [user]);

    useEffect(() => {
        void syncSessionAndProfile();

        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((_event, session) => {
            setUser(session?.user ?? null);
            if (!session?.user) {
                setProfile(null);
            } else {
                void getUserProfile(session.user.id)
                    .then((nextProfile) => {
                        setProfile(nextProfile);
                    })
                    .catch(() => {
                        setProfile(null);
                    });
            }
            setIsAuthReady(true);
        });

        return () => {
            subscription.unsubscribe();
        };
    }, [syncSessionAndProfile]);

    const displayName = useMemo(() => getDisplayNameFromUser(user, profile), [user, profile]);

    const value = useMemo(
        () => ({
            isAuthReady,
            user,
            profile,
            displayName,
            isAuthenticated: Boolean(user),
            signInWithGoogle,
            signInWithKakao,
            signOut,
            refreshProfile,
            createUserProfile,
        }),
        [isAuthReady, user, profile, displayName, signInWithGoogle, signInWithKakao, signOut, refreshProfile, createUserProfile]
    );

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('`useAuth`는 `AuthProvider` 내부에서만 사용할 수 있습니다.');
    }
    return context;
}
