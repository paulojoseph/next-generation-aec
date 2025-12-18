/**
 * @fileoverview Shared Utility Functions
 *
 * Common utilities used across the application.
 */

import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge Tailwind CSS classes with conflict resolution.
 *
 * Combines clsx for conditional classes with tailwind-merge
 * for proper handling of Tailwind CSS class conflicts.
 *
 * @example
 * ```ts
 * cn('px-4 py-2', isActive && 'bg-blue-500', 'px-6')
 * // Returns: 'py-2 px-6 bg-blue-500' (px-4 overridden by px-6)
 * ```
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Format a number as a fixed decimal string.
 */
export function formatDecimal(value: number, decimals = 2): string {
  return value.toFixed(decimals);
}

/**
 * Format bytes to human-readable size.
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Throttle function execution.
 */
export function throttle<T extends (...args: unknown[]) => void>(
  func: T,
  limit: number
): T {
  let inThrottle = false;

  return ((...args: Parameters<T>) => {
    if (inThrottle) return;
    func(...args);
    inThrottle = true;
    setTimeout(() => { inThrottle = false; }, limit);
  }) as T;
}

/**
 * Debounce function execution.
 */
export function debounce<T extends (...args: unknown[]) => void>(
  func: T,
  wait: number
): T {
  let timeout: ReturnType<typeof setTimeout> | null = null;

  return ((...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  }) as T;
}
