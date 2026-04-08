import type { Metadata, Viewport } from "next";

import { AppShell } from "../components/AppShell";

import "./globals.css";

const shopAppUrl =
  process.env.NEXT_PUBLIC_SHOP_APP_URL ?? "https://web.jinmarket.shop";

export const metadata: Metadata = {
  metadataBase: new URL(shopAppUrl),
  title: "진마켓 구매 사이트",
  description: "가위바위보와 즉시 구매를 지원하는 진마켓 구매자용 웹앱",
  openGraph: {
    type: "website",
    url: shopAppUrl,
    title: "진마켓 구매 사이트",
    description: "가위바위보와 즉시 구매를 지원하는 진마켓 구매자용 웹앱",
    siteName: "진마켓",
    images: [
      {
        url: "/header.png",
        alt: "진마켓 대표 이미지",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "진마켓 구매 사이트",
    description: "가위바위보와 즉시 구매를 지원하는 진마켓 구매자용 웹앱",
    images: ["/header.png"],
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
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
