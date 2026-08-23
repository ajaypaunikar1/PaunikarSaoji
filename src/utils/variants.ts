import type { MenuItem } from '../types/types';

/**
 * Resolve the unit price of a menu item for a given portion/variant label.
 * 'Single' (or unknown labels) falls back to the item's base price so legacy
 * items without variants keep working.
 */
export function resolvePortionPrice(item: MenuItem, portion: string): number {
  if (!portion || portion === 'Single') return item.price;
  const variant = item.variants.find(v => v.name === portion);
  return variant ? variant.price : item.price;
}
