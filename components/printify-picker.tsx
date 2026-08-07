"use client";

import { useState } from "react";
import { PackageSearch } from "lucide-react";

type Shop = { id: number; title: string; sales_channel?: string };
type Product = { id: string; title: string; description?: string; images?: Array<{ src: string }>; variants?: Array<{ price: number; is_enabled: boolean }> };

export function PrintifyPicker({ onSelect }: { onSelect: (product: { id: string; name: string; price: string; detail: string }) => void }) {
  const [shops, setShops] = useState<Shop[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [shopId, setShopId] = useState<number | null>(null);
  const [message, setMessage] = useState("");

  async function loadShops() {
    setMessage("Loading Printify shops...");
    const response = await fetch("/api/printify/shops");
    const data = await response.json();
    if (!response.ok) return setMessage(data.error || "Unable to load Printify shops.");
    setShops(data.shops || []);
    setMessage(data.shops?.length ? "Select a Printify shop." : "No Printify shops found.");
  }

  async function loadProducts(id: number) {
    setShopId(id);
    setMessage("Loading Printify products...");
    const response = await fetch(`/api/printify/products?shopId=${id}`);
    const data = await response.json();
    if (!response.ok) return setMessage(data.error || "Unable to load Printify products.");
    setProducts(data.data || []);
    setMessage("Choose a Printify product for this livestream.");
  }

  function choose(product: Product) {
    const enabled = product.variants?.filter((v) => v.is_enabled) || [];
    const cents = enabled.length ? Math.min(...enabled.map((v) => v.price)) : 0;
    onSelect({ id: `printify-${product.id}`, name: product.title, price: cents ? `$${(cents / 100).toFixed(2)}` : "Price pending", detail: "Imported from Printify" });
    setMessage(`${product.title} selected.`);
  }

  return <div className="integrationCard">
    <div className="integrationHeader"><PackageSearch size={20}/><div><strong>Printify</strong><span>Use products from your connected Printify shop.</span></div></div>
    {!shops.length && <button className="ghostButton" onClick={loadShops}>Connect / Load Printify</button>}
    {!!shops.length && <select value={shopId ?? ""} onChange={(e) => loadProducts(Number(e.target.value))}><option value="">Select shop</option>{shops.map((shop) => <option key={shop.id} value={shop.id}>{shop.title}</option>)}</select>}
    {!!products.length && <div className="printifyGrid">{products.slice(0, 12).map((product) => <button className="miniProduct" key={product.id} onClick={() => choose(product)}><strong>{product.title}</strong><span>{product.variants?.filter((v) => v.is_enabled).length || 0} enabled variants</span></button>)}</div>}
    {message && <small className="helperText">{message}</small>}
  </div>;
}
