/**
 * Menu category helpers.
 *
 * Categories are intentionally NOT a DB column: the available list is
 *  1. the fixed defaults,
 *  2. plus user-created categories persisted per device (localStorage),
 *  3. plus any category discovered on existing menu items — so a category
 *     created on one device shows up everywhere as soon as an item uses it.
 */

export const DEFAULT_CATEGORIES = [
  'Vegetarian',
  'Egg Curry',
  'Breads',
  'Rice',
  'Papad',
  'Starters',
  'Curries',
  'Handi Dishes'
] as const;

const LS_KEY = 'rms_custom_categories';

/** Marathi display labels for the built-in categories. */
const MR_LABELS: Record<string, string> = {
  'Vegetarian': 'वेज (Veg)',
  'Egg Curry': 'अंडा करी (Egg)',
  'Breads': 'चपाती (Breads)',
  'Rice': 'राईस (Rice)',
  'Papad': 'पापड (Papad)',
  'Starters': 'स्टार्टर (Starters)',
  'Curries': 'करी (Curries)',
  'Handi Dishes': 'हांडी (Handi)',
  'All': 'सर्व आयटम (All)'
};

export function getCategoryLabel(cat: string, language: 'en' | 'mr'): string {
  if (language === 'mr' && MR_LABELS[cat]) return MR_LABELS[cat];
  return cat;
}

export function loadCustomCategories(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((c: unknown): c is string => typeof c === 'string' && c.trim().length > 0) : [];
  } catch {
    return [];
  }
}

export function saveCustomCategories(list: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(list));
  } catch {
    /* storage full/blocked — categories still work for this session */
  }
}

/**
 * Full ordered category list: defaults, then custom, then any extra
 * categories found on menu items (alphabetical), case-insensitively deduped.
 */
export function buildCategoryList(menuItems: { category?: string }[], custom: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  const push = (cat: string) => {
    const key = cat.trim().toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(cat.trim());
  };

  DEFAULT_CATEGORIES.forEach(push);
  custom.forEach(push);

  Array.from(new Set(menuItems.map(m => m.category).filter((c): c is string => !!c)))
    .sort((a, b) => a.localeCompare(b))
    .forEach(push);

  return out;
}

export function normalizeCategoryName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}
