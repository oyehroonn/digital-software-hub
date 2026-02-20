/**
 * API Client for DSM-3D Backend
 * Base URL: http://localhost:5051 (or set VITE_API_BASE env var)
 */

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:5051';

export interface Product {
  id: string | number;
  name: string;
  folder: string;
  filename: string;
  link: string;
  viewer: string;
  category: string;
  categories?: string[];
  brand: string;
  licenseType: string;
  price: string;
  description: string;
  fullDescription?: string;
  tags: string[];
  sku?: string;
  stockStatus?: string;
  status: string;
  whatsIncluded?: string[];
  platform?: string;
  validity?: string;
}

export interface FilterOption {
  name: string;
  count: number;
}

export interface FiltersResponse {
  brands: FilterOption[];
  categories: FilterOption[];
  licenseTypes: FilterOption[];
}

export interface ProductsResponse {
  count: number;
  products: Product[];
  page?: number;
  limit?: number;
  totalPages?: number;
}

export interface SearchResponse {
  count: number;
  products: Product[];
  suggestions: string[];
}

export interface AISearchResponse {
  intent: string;
  filters: Record<string, string[]>;
  productIds: string[];
  suggestions: string[];
}

export interface AIChatResponse {
  message: string;
  actions: AIAction[];
  suggestions: string[];
  products?: Product[]; // Products found during search
}

export interface AIAction {
  type: 'OPEN_PRODUCT' | 'NAVIGATE' | 'APPLY_FILTERS' | 'SET_SEARCH' | 'SCROLL_TO';
  payload: Record<string, any>;
}

// ── API Client Functions ───────────────────────────────────────────────────

export async function getFilters(): Promise<FiltersResponse> {
  const res = await fetch(`${API_BASE}/filters`);
  if (!res.ok) throw new Error('Failed to fetch filters');
  return res.json();
}

export async function getTopProducts(limit = 10): Promise<ProductsResponse> {
  const res = await fetch(`${API_BASE}/products/top?limit=${limit}`);
  if (!res.ok) throw new Error('Failed to fetch top products');
  return res.json();
}

export async function getProducts(params: {
  page?: number;
  limit?: number;
  sort?: string;
  brand?: string[];
  category?: string[];
  licenseType?: string[];
  q?: string;
}): Promise<ProductsResponse> {
  const searchParams = new URLSearchParams();
  if (params.page) searchParams.set('page', params.page.toString());
  if (params.limit) searchParams.set('limit', params.limit.toString());
  if (params.sort) searchParams.set('sort', params.sort);
  if (params.q) searchParams.set('q', params.q);
  params.brand?.forEach(b => searchParams.append('brand', b));
  params.category?.forEach(c => searchParams.append('category', c));
  params.licenseType?.forEach(l => searchParams.append('licenseType', l));

  const res = await fetch(`${API_BASE}/products?${searchParams}`);
  if (!res.ok) throw new Error('Failed to fetch products');
  return res.json();
}

export async function getProductById(id: string | number): Promise<Product> {
  const res = await fetch(`${API_BASE}/products/${id}`);
  if (!res.ok) throw new Error(`Failed to fetch product ${id}`);
  return res.json();
}

export async function searchProducts(query: string): Promise<SearchResponse> {
  const res = await fetch(`${API_BASE}/search?q=${encodeURIComponent(query)}`);
  if (!res.ok) throw new Error('Search failed');
  return res.json();
}

export async function aiSearch(query: string): Promise<AISearchResponse> {
  const res = await fetch(`${API_BASE}/ai-search?q=${encodeURIComponent(query)}`);
  if (!res.ok) throw new Error('AI search failed');
  return res.json();
}

export async function aiChat(message: string, context?: Record<string, any>): Promise<AIChatResponse> {
  const res = await fetch(`${API_BASE}/ai/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, context }),
  });
  if (!res.ok) throw new Error('AI chat failed');
  return res.json();
}

export async function productChat(message: string, productId: string | number): Promise<AIChatResponse> {
  const res = await fetch(`${API_BASE}/ai/product-chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, productId }),
  });
  if (!res.ok) throw new Error('Product chat failed');
  return res.json();
}

