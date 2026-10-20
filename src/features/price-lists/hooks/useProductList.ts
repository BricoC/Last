import { useState, useEffect, useCallback } from "react";
import { Product, CreateProductInput } from "../models/product";
import { productRepository } from "../services/productRepository";

export function useProductList() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");

  const loadProducts = useCallback(async (query?: string) => {
    try {
      setLoading(true);
      setError(null);
      const data = await productRepository.getActiveProducts(query);
      setProducts(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Errore caricamento articoli SQLite";
      console.error("[useProductList]", err);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProducts(searchQuery);
  }, [loadProducts, searchQuery]);

  const addProduct = async (input: CreateProductInput) => {
    try {
      setError(null);
      const created = await productRepository.createProduct(input);
      setProducts((prev) => [created, ...prev]);
      return created;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Errore salvataggio articolo";
      setError(msg);
      throw err;
    }
  };

  const updateProduct = async (id: string, updates: Partial<Product>) => {
    try {
      setError(null);
      const updated = await productRepository.updateProduct(id, updates);
      setProducts((prev) => prev.map((p) => (p.id === id ? updated : p)));
      return updated;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Errore aggiornamento articolo";
      setError(msg);
      throw err;
    }
  };

  const deleteProduct = async (id: string) => {
    try {
      setError(null);
      await productRepository.softDeleteProduct(id);
      setProducts((prev) => prev.filter((p) => p.id !== id));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Errore eliminazione articolo";
      setError(msg);
      throw err;
    }
  };

  return {
    products,
    loading,
    error,
    searchQuery,
    setSearchQuery,
    addProduct,
    updateProduct,
    deleteProduct,
    reload: () => loadProducts(searchQuery),
  };
}
