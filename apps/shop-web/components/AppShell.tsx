"use client";

import { BuyerSessionProvider } from "./BuyerSessionProvider";
import { ServiceWorkerRegistration } from "./ServiceWorkerRegistration";
import { ShopChrome } from "./ShopChrome";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <BuyerSessionProvider>
      <ServiceWorkerRegistration />
      <ShopChrome>{children}</ShopChrome>
    </BuyerSessionProvider>
  );
}
