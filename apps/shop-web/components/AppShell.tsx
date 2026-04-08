"use client";

import { ShopChrome } from "./ShopChrome";

export function AppShell({ children }: { children: React.ReactNode }) {
  return <ShopChrome>{children}</ShopChrome>;
}
