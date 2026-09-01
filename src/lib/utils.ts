import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Название объекта + адрес через " · ", либо просто название, если адрес не указан. */
export function objectLabel(name: string, address?: string | null) {
  return address && address.trim() ? `${name} · ${address}` : name;
}
