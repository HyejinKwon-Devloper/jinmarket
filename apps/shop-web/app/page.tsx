export const dynamic = "force-dynamic";

import { HomeCatalogClient } from "../components/HomeCatalogClient";
import { readProducts } from "../lib/server-api";

export default async function ShopHomePage() {
  const initialItems = await readProducts();

  return <HomeCatalogClient initialItems={initialItems} />;
}
