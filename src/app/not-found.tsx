'use client';

import Link from 'next/link';
import { Home, ArrowLeft } from 'lucide-react';

export default function NotFoundPage() {
    return (
        <div className="min-h-[70vh] flex items-center justify-center px-4">
            <div className="text-center max-w-md">
                <p className="text-7xl font-bold text-[#B95D69] mb-4">404</p>
                <h1 className="text-2xl font-bold text-gray-900 mb-2">
                    페이지를 찾을 수 없습니다
                </h1>
                <p className="text-sm text-gray-500 mb-8">
                    요청하신 페이지가 존재하지 않거나, 이동되었을 수 있습니다.
                </p>
                <div className="flex items-center justify-center gap-3">
                    <button
                        type="button"
                        onClick={() => window.history.back()}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors cursor-pointer"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        이전 페이지
                    </button>
                    <Link
                        href="/dashboard"
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-white bg-[#B95D69] hover:bg-[#A04C58] transition-colors"
                    >
                        <Home className="w-4 h-4" />
                        대시보드로 이동
                    </Link>
                </div>
            </div>
        </div>
    );
}
