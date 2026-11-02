import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

// Merge Tailwind classes, later ones winning (the `cn` helper the registry components import).
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
