'use client';

import React from 'react';
import { Swiper, SwiperSlide } from 'swiper/react';
import 'swiper/css';
import { clsx } from 'clsx';

export interface TabItem {
    id: string;
    label: string;
}

interface TabSwiperProps {
    tabs: TabItem[];
    activeTabId: string;
    onTabClick: (id: string) => void;
    themeColor: string; // Used for Category active state or fallback
    variant?: 'STATUS' | 'CATEGORY';
    colorMap?: Record<string, string>; // Optional map for specific status colors
    className?: string;
}

export function TabSwiper({
    tabs,
    activeTabId,
    onTabClick,
    themeColor,
    variant = 'STATUS',
    colorMap,
    className
}: TabSwiperProps) {
    return (
        <div className={clsx("w-full relative", className)}>
            <Swiper
                spaceBetween={12}
                slidesPerView="auto"
                className="w-full"
                wrapperClass="items-center"
            >
                {tabs.map((tab) => {
                    const isActive = activeTabId === tab.id;

                    // Determine styles based on variant
                    let baseClasses = "transition-all duration-200 whitespace-nowrap cursor-pointer flex items-center justify-center";
                    let activeClasses = "";
                    let inactiveClasses = "bg-white border border-gray-100 text-gray-500 hover:bg-gray-50";
                    let style: React.CSSProperties = {};

                    if (variant === 'STATUS') {
                        // STATUS: Rounded-full, specific colors if provided
                        baseClasses += " px-5 py-2.5 rounded-full text-sm font-medium";

                        if (isActive) {
                            const statusColor = colorMap?.[tab.id] || themeColor;
                            activeClasses = "text-white shadow-sm border-transparent";
                            style = { backgroundColor: statusColor };
                        }
                    } else {
                        // CATEGORY: Rounded-[12px], Flat & Clean, No Shadow
                        baseClasses += " px-6 py-3 rounded-[12px] text-base font-bold border transition-colors";

                        if (isActive) {
                            // Active: Solid Theme Color, No Ring/Shadow
                            activeClasses = "text-white";
                            style = { backgroundColor: themeColor, borderColor: themeColor };
                        } else {
                            // Inactive: White, Gray Border, No Shadow
                            inactiveClasses = "bg-white text-gray-400 border-gray-200 hover:bg-gray-50 hover:text-gray-600";
                        }
                    }

                    return (
                        <SwiperSlide key={tab.id} style={{ width: 'auto' }}>
                            <button
                                onClick={() => onTabClick(tab.id)}
                                className={clsx(
                                    baseClasses,
                                    isActive ? activeClasses : inactiveClasses
                                )}
                                style={style}
                            >
                                {tab.label}
                            </button>
                        </SwiperSlide>
                    );
                })}
            </Swiper>
        </div>
    );
}
