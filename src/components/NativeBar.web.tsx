import type { LookItem } from './TabBarLooks';

/**
 * The website never has Apple's own bottom bar (barLens's useBarApple is for iPhones with Liquid Glass only): nothing
 * here, so react-native-screens' Tabs stays out of the website's bundle and the website's bar is exactly as it was.
 */
export type NativeIcons = Readonly<Record<string, never>>;
export const ICON_WAIT_MS = 3000;
export function prepareNativeBarIcons(_items: readonly LookItem[]): void {}
export function useNativeBarIcons(_on: boolean, _items: readonly LookItem[]): NativeIcons | null {
  return null;
}
export function NativeBar(_props: Record<string, unknown>): null {
  return null;
}
