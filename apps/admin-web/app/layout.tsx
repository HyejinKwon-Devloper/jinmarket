import type { Metadata, Viewport } from "next";

import { AdminChrome } from "../components/AdminChrome";

import "./tailwind.css";
import "./globals.css";

const adminAppUrl =
  process.env.NEXT_PUBLIC_ADMIN_APP_URL ?? "https://management.jinmarket.shop";
const shopAppUrl =
  process.env.NEXT_PUBLIC_SHOP_APP_URL ?? "https://web.jinmarket.shop";
const sharedOgImage = `${shopAppUrl.replace(/\/$/, "")}/header.png`;

export const metadata: Metadata = {
  metadataBase: new URL(adminAppUrl),
  title: "진마켓 판매자 센터",
  description: "이벤트, 상품, 주문을 관리하는 진마켓 판매자용 어드민",
  openGraph: {
    type: "website",
    url: adminAppUrl,
    title: "진마켓 판매자 센터",
    description: "이벤트, 상품, 주문을 관리하는 진마켓 판매자용 어드민",
    siteName: "진마켓",
    images: [
      {
        url: sharedOgImage,
        alt: "진마켓 판매자 센터 대표 이미지",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "진마켓 판매자 센터",
    description: "이벤트, 상품, 주문을 관리하는 진마켓 판매자용 어드민",
    images: [sharedOgImage],
  },
  other: {
    "facebook-domain-verification": "ffk2jbyjn6phl8vetpkp87bjuf7q4o",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
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
