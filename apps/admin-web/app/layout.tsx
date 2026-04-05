import type { Metadata } from "next";

import { AdminChrome } from "../components/AdminChrome";

import "./globals.css";

const adminAppUrl =
  process.env.NEXT_PUBLIC_ADMIN_APP_URL ?? "https://management.jinmarket.shop";
const shopAppUrl =
  process.env.NEXT_PUBLIC_SHOP_APP_URL ?? "https://web.jinmarket.shop";
const sharedOgImage = `${shopAppUrl.replace(/\/$/, "")}/header.png`;

export const metadata: Metadata = {
  metadataBase: new URL(adminAppUrl),
  title: "진의 벼룩시장 - 판매자 사이트",
  description: "판매자용 상품 관리와 주문 관리",
  openGraph: {
    type: "website",
    url: adminAppUrl,
    title: "진의 벼룩시장 - 판매자 사이트",
    description: "판매자용 상품 관리와 주문 관리",
    siteName: "진의 벼룩시장",
    images: [
      {
        url: sharedOgImage,
        alt: "진의 벼룩시장 판매자 사이트 대표 이미지",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "진의 벼룩시장 - 판매자 사이트",
    description: "판매자용 상품 관리와 주문 관리",
    images: [sharedOgImage],
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
        <AdminChrome>{children}</AdminChrome>
      </body>
    </html>
  );
}
