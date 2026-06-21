import type { Metadata, Viewport } from "next";

import { AdminChrome } from "../components/AdminChrome";
import { ServiceWorkerRegistration } from "../components/ServiceWorkerRegistration";

import "./tailwind.css";
import "./globals.css";

const adminAppUrl =
  process.env.NEXT_PUBLIC_ADMIN_APP_URL ?? "https://management.jinmarket.shop";
const shopAppUrl =
  process.env.NEXT_PUBLIC_SHOP_APP_URL ?? "https://web.jinmarket.shop";
const sharedOgImage = `${shopAppUrl.replace(/\/$/, "")}/header.png`;

export const metadata: Metadata = {
  metadataBase: new URL(adminAppUrl),
  applicationName: "Jinmarket Seller",
  manifest: "/manifest.webmanifest",
  title: "JINMARKET 판매자 센터",
  description: "상품, 이벤트, 주문을 한곳에서 관리하는 JINMARKET 판매자용 웹앱입니다.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Jinmarket Seller",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    shortcut: ["/icon-192.png"],
  },
  openGraph: {
    type: "website",
    url: adminAppUrl,
    title: "JINMARKET 판매자 센터",
    description: "상품, 이벤트, 주문을 한곳에서 관리하는 JINMARKET 판매자용 웹앱입니다.",
    siteName: "JINMARKET",
    images: [
      {
        url: sharedOgImage,
        alt: "JINMARKET 판매자 센터 대표 이미지",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "JINMARKET 판매자 센터",
    description: "상품, 이벤트, 주문을 한곳에서 관리하는 JINMARKET 판매자용 웹앱입니다.",
    images: [sharedOgImage],
  },
  other: {
    "facebook-domain-verification": "ffk2jbyjn6phl8vetpkp87bjuf7q4o",
    "mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#1f4e79",
  colorScheme: "light",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>
        <ServiceWorkerRegistration />
        <AdminChrome>{children}</AdminChrome>
      </body>
    </html>
  );
}
