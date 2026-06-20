export const dynamic = "force-dynamic";

import { HomeCatalogClient } from "../components/HomeCatalogClient";
import { readCurrentUser, readProducts } from "../lib/server-api";

export default async function ShopHomePage() {
  const [initialUser, initialItems] = await Promise.all([
    readCurrentUser(),
    readProducts(),
  ]);

  return <HomeCatalogClient initialItems={initialItems} initialUser={initialUser} />;
}
