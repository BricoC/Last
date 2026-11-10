export interface SupplierPriceListItem {
  id: string;
  file_id: string;
  supplier_name: string;
  code: string;
  description: string;
  price: number;
  net_price?: number;
  unit: string;
  barcode?: string | null;
  list_date?: string | null;
  brand?: string | null;
  notes?: string | null;
  extra_code?: string | null;
  created_at: string;
}

export interface SupplierPriceListFile {
  id: string;
  filename: string;
  file_path: string;
  supplier_name: string;
  file_date?: string | null;
  file_size: number;
  last_modified_ms: number;
  total_items: number;
  imported_at: string;
}

export interface SupplierDistinctInfo {
  name: string;
  items_count: number;
  last_date?: string | null;
}

