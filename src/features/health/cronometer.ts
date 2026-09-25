import * as DocumentPicker from 'expo-document-picker';

import type { DailyHealth } from '@/data/types';

/** One day of nutrition from a Cronometer export. */
export type NutritionDay = Pick<DailyHealth, 'date' | 'calories' | 'proteinGrams' | 'carbGrams' | 'fatGrams'>;

/**
 * Cronometer has no public API, but it exports your days as a spreadsheet
 * (Settings → Data → Export → Daily Nutrition). This reads that file.
 */
export async function pickCronometerExport(): Promise<NutritionDay[] | null> {
  const picked = await DocumentPicker.getDocumentAsync({ type: ['text/csv', 'text/comma-separated-values', 'text/plain', 'public.comma-separated-values-text'], copyToCacheDirectory: true });
  if (picked.canceled || !picked.assets?.[0]?.uri) return null;
  const text = await (await fetch(picked.assets[0].uri)).text();
  const days = parseCronometerCsv(text);
  if (!days.length) throw new Error('That file has no daily totals in it. In Cronometer, export "Daily Nutrition" and try again.');
  return days;
}

/** A CSV line, minding quoted commas. */
const cells = (line: string) => {
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (const ch of line) {
    if (ch === '"') q = !q;
    else if (ch === ',' && !q) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
};

export function parseCronometerCsv(text: string): NutritionDay[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const head = cells(lines[0]).map((h) => h.toLowerCase());
  const col = (...names: string[]) => head.findIndex((h) => names.some((n) => h.startsWith(n)));
  const iDate = col('date', 'day');
  const iKcal = col('energy (kcal)', 'energy', 'calories');
  const iProt = col('protein (g)', 'protein');
  const iCarb = col('carbs (g)', 'net carbs (g)', 'carbohydrates', 'carbs');
  const iFat = col('fat (g)', 'fat');
  if (iDate < 0 || iKcal < 0) return [];
  const byDate = new Map<string, NutritionDay>();
  for (const line of lines.slice(1)) {
    const c = cells(line);
    const raw = c[iDate];
    const stamp = Date.parse(raw);
    if (!raw || Number.isNaN(stamp)) continue;
    const date = new Date(stamp).toISOString().slice(0, 10);
    const n = (i: number) => (i >= 0 ? Math.round(Number(c[i]) || 0) : 0);
    // A per-food export lists many rows per day: they are summed into one.
    const have = byDate.get(date) ?? { date, calories: 0, proteinGrams: 0, carbGrams: 0, fatGrams: 0 };
    byDate.set(date, { date, calories: have.calories + n(iKcal), proteinGrams: have.proteinGrams + n(iProt), carbGrams: have.carbGrams + n(iCarb), fatGrams: have.fatGrams + n(iFat) });
  }
  return [...byDate.values()].filter((d) => d.calories > 0).sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 60);
}
