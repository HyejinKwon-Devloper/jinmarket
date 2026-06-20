export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";

import { ProductDetailClient } from "../../../components/ProductDetailClient";
import {
  readCurrentUser,
  readProductDetail,
  ServerApiError,
} from "../../../lib/server-api";

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  try {
    const [initialUser, initialItem] = await Promise.all([
      readCurrentUser(),
      readProductDetail(id),
    ]);

    return (
      <ProductDetailClient
        initialItem={initialItem}
        initialUser={initialUser}
        productId={id}
      />
    );
  } catch (error) {
    if (error instanceof ServerApiError && error.statusCode === 404) {
      notFound();
    }

    throw error;
  }
}
