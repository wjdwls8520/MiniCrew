import type { Metadata } from "next";
import "./globals.css";
import MainLayout from "@/components/layout/MainLayout";

export const metadata: Metadata = {
  title: "MiniCrew",
  description: "팀 협업 워크플로우 — 프로젝트 관리, 업무 배정, 실시간 채팅을 하나로",
  icons: {
    icon: "/favicon.png",
    apple: "/favicon.png",
  },
  openGraph: {
    title: "MiniCrew",
    description: "팀 협업 워크플로우 — 프로젝트 관리, 업무 배정, 실시간 채팅을 하나로",
    url: "https://mini-crew.vercel.app",
    siteName: "MiniCrew",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "MiniCrew - 팀 협업 워크플로우",
      },
    ],
    locale: "ko_KR",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "MiniCrew",
    description: "팀 협업 워크플로우 — 프로젝트 관리, 업무 배정, 실시간 채팅을 하나로",
    images: ["/og-image.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>
        <MainLayout>
          {children}
        </MainLayout>
      </body>
    </html>
  );
}
