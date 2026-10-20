import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Combina classi Tailwind gestendo i conflitti in modo deterministico.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
