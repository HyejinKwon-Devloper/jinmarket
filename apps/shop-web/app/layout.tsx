import type { Metadata } from "next";

import { ShopChrome } from "../components/ShopChrome";

import "./globals.css";

export const metadata: Metadata = {
  title: "진의 벼룩시장 - 구매자 사이트",
  description: "가위바위보와 즉시 구매를 지원하는 벼룩시장",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>
        <ShopChrome>{children}</ShopChrome>
      </body>
    </html>
  );
}
