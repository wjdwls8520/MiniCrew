'use client';

import { useEffect } from 'react';
import { RefreshCw, Home } from 'lucide-react';
import Link from 'next/link';

export default function ErrorPage({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        console.error('[MiniCrew] Unhandled error:', error);
    }, [error]);

    return (
        <div className="min-h-[70vh] flex items-center justify-center px-4">
            <div className="text-center max-w-md">
                <p className="text-6xl mb-4">⚠️</p>
                <h1 className="text-2xl font-bold text-gray-900 mb-2">
                    문제가 발생했습니다
                </h1>
                <p className="text-sm text-gray-500 mb-8">
                    예상치 못한 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.
                </p>
                <div className="flex items-center justify-center gap-3">
                    <button
                        type="button"
                        onClick={reset}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-white bg-[#B95D69] hover:bg-[#A04C58] transition-colors cursor-pointer"
                    >
                        <RefreshCw className="w-4 h-4" />
                        다시 시도
                    </button>
                    <Link
                        href="/dashboard"
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors"
                    >
                        <Home className="w-4 h-4" />
                        대시보드로 이동
                    </Link>
                </div>
            </div>
        </div>
    );
}
