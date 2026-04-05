import type { Metadata } from "next";

import { ShopChrome } from "../components/ShopChrome";

import "./globals.css";

const shopAppUrl =
  process.env.NEXT_PUBLIC_SHOP_APP_URL ?? "https://web.jinmarket.shop";

export const metadata: Metadata = {
  metadataBase: new URL(shopAppUrl),
  title: "진의 벼룩시장 - 구매자 사이트",
  description: "가위바위보와 즉시 구매를 지원하는 벼룩시장",
  openGraph: {
    type: "website",
    url: shopAppUrl,
    title: "진의 벼룩시장 - 구매자 사이트",
    description: "가위바위보와 즉시 구매를 지원하는 벼룩시장",
    siteName: "진의 벼룩시장",
    images: [
      {
        url: "/header.png",
        alt: "진의 벼룩시장 대표 이미지",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "진의 벼룩시장 - 구매자 사이트",
    description: "가위바위보와 즉시 구매를 지원하는 벼룩시장",
    images: ["/header.png"],
  },
  other: {
    "facebook-domain-verification": "ffk2jbyjn6phl8vetpkp87bjuf7q4o",
  },
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
