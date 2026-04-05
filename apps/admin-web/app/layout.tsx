import type { Metadata } from "next";

import { AdminChrome } from "../components/AdminChrome";

import "./globals.css";

export const metadata: Metadata = {
  title: "진의 벼룩시장 - 판매자 사이트",
  description: "판매자용 상품 관리와 주문 관리",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>
        <AdminChrome>{children}</AdminChrome>
      </body>
    </html>
  );
}
