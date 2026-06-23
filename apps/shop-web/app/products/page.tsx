export const dynamic = "force-dynamic";

import { ProductCatalogPageClient } from "../../components/ProductCatalogPageClient";
import { readProducts } from "../../lib/server-api";

export default async function ProductCatalogPage() {
  const initialItems = await readProducts();

  return <ProductCatalogPageClient initialItems={initialItems} />;
}
