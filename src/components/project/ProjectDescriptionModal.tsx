'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { clsx } from 'clsx';

interface ProjectDescriptionModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    description: string;
    themeColor: string;
}

export function ProjectDescriptionModal({ isOpen, onClose, title, description, themeColor }: ProjectDescriptionModalProps) {
    const [isMounted, setIsMounted] = useState(false);
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
            const openTimer = window.setTimeout(() => {
                setIsMounted(true);
                requestAnimationFrame(() => {
                    setIsVisible(true);
                });
            }, 0);

            return () => {
                window.clearTimeout(openTimer);
                document.body.style.overflow = 'unset';
            };
        }

        const closeVisibilityTimer = window.setTimeout(() => {
            setIsVisible(false);
            document.body.style.overflow = 'unset';
        }, 0);

        const closeUnmountTimer = window.setTimeout(() => {
            setIsMounted(false);
        }, 300);

        return () => {
            window.clearTimeout(closeVisibilityTimer);
            window.clearTimeout(closeUnmountTimer);
        };

    }, [isOpen]);

    if (!isMounted) return null;

    return createPortal(
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 sm:p-6">
            {/* Backdrop */}
            <div
                className={clsx(
                    "fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-300 ease-out cursor-pointer",
                    isVisible ? "opacity-100" : "opacity-0"
                )}
                onClick={onClose}
                aria-hidden="true"
            />

            {/* Modal Content */}
            <div
                className={clsx(
                    "relative bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden transition-all duration-300 ease-out transform",
                    isVisible ? "scale-100 opacity-100 translate-y-0" : "scale-95 opacity-0 translate-y-4"
                )}
                role="dialog"
                aria-modal="true"
                aria-labelledby="modal-title"
            >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
                    <h3 id="modal-title" className="text-lg font-bold text-gray-900 truncate pr-4">
                        {title}
                    </h3>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-full hover:bg-gray-100 transition-colors text-gray-500 cursor-pointer"
                        aria-label="Close modal"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Body (Scrollable) */}
                <div className="p-6 overflow-y-auto custom-scrollbar">
                    <div className="prose prose-sm max-w-none text-gray-700 whitespace-pre-wrap leading-relaxed">
                        {description || "설명이 없습니다."}
                    </div>
                </div>

                {/* Footer (Optional) */}
                <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 rounded-lg text-white font-medium text-sm transition-opacity hover:opacity-90 cursor-pointer"
                        style={{ backgroundColor: themeColor }}
                    >
                        닫기
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}
