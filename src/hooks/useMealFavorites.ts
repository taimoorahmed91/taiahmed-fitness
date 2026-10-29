import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

export const FAVORITES_KEY = 'fittrack-meal-favorites';
export const MAX_MEAL_FAVORITES = 5;
const EVENT = 'fittrack-meal-favorites-change';

const load = (): string[] => {
  try { return JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]'); } catch { return []; }
};

/** Shared, localStorage-backed meal favorites (keyed by lower-cased food name), capped at 5. */
export const useMealFavorites = () => {
  const [favorites, setFavorites] = useState<string[]>(load);

  useEffect(() => {
    const sync = () => setFavorites(load());
    window.addEventListener(EVENT, sync);
    window.addEventListener('storage', sync);
    return () => { window.removeEventListener(EVENT, sync); window.removeEventListener('storage', sync); };
  }, []);

  const isFavorite = useCallback((name: string) => favorites.includes(name.trim().toLowerCase()), [favorites]);

  const toggleFavorite = useCallback((name: string) => {
    const key = name.trim().toLowerCase();
    const current = load();
    let next: string[];
    if (current.includes(key)) {
      next = current.filter((f) => f !== key);
    } else {
      if (current.length >= MAX_MEAL_FAVORITES) {
        toast.error(`You can add up to ${MAX_MEAL_FAVORITES} meals to quick add. Remove one first.`);
        return;
      }
      next = [...current, key];
    }
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
    setFavorites(next);
    window.dispatchEvent(new Event(EVENT));
  }, []);

  return { favorites, isFavorite, toggleFavorite };
};
