export const dynamic = "force-dynamic";

import { ProductCatalogPageClient } from "../../components/ProductCatalogPageClient";
import { readCurrentUser, readProducts } from "../../lib/server-api";

export default async function ProductCatalogPage() {
  const [initialUser, initialItems] = await Promise.all([
    readCurrentUser(),
    readProducts(),
  ]);

  return (
    <ProductCatalogPageClient initialItems={initialItems} initialUser={initialUser} />
  );
}
