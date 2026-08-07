const PRINTIFY_API_BASE = "https://api.printify.com/v1";

type PrintifyRequestOptions = RequestInit & {
  token?: string;
};

export async function printifyRequest<T>(path: string, options: PrintifyRequestOptions = {}): Promise<T> {
  const token = options.token || process.env.PRINTIFY_API_TOKEN;
  if (!token) {
    throw new Error("PRINTIFY_API_TOKEN is not configured.");
  }

  const response = await fetch(`${PRINTIFY_API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Printify request failed (${response.status}): ${detail.slice(0, 300)}`);
  }

  return (await response.json()) as T;
}

export type PrintifyShop = {
  id: number;
  title: string;
  sales_channel?: string;
};

export type PrintifyProduct = {
  id: string;
  title: string;
  description?: string;
  images?: Array<{ src: string; position?: string; is_default?: boolean }>;
  variants?: Array<{ id: number; title: string; price: number; is_enabled: boolean; is_available?: boolean; sku?: string }>;
};

export async function getPrintifyShops() {
  return printifyRequest<PrintifyShop[]>("/shops.json");
}

export async function getPrintifyProducts(shopId: number) {
  return printifyRequest<{ data: PrintifyProduct[]; current_page?: number; last_page?: number }>(`/shops/${shopId}/products.json`);
}
