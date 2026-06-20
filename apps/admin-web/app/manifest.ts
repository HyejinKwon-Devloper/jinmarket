import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "JINMARKET Admin",
    short_name: "JM Admin",
    description: "JINMARKET 판매자 센터를 홈 화면에 설치해 상품과 주문을 더 빠르게 관리해 보세요.",
    start_url: "/products",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f8fafc",
    theme_color: "#1f4e79",
    lang: "ko-KR",
    categories: ["business", "productivity"],
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    related_applications: [],
    prefer_related_applications: false,
  };
}
