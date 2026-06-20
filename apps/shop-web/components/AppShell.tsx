"use client";

import { ServiceWorkerRegistration } from "./ServiceWorkerRegistration";
import { ShopChrome } from "./ShopChrome";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ServiceWorkerRegistration />
      <ShopChrome>{children}</ShopChrome>
    </>
  );
}
