import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import type { User } from '@/data/types';
import type { YearInTennis } from '@/features/wrapped/yearInTennis';
import { compactNumber } from '@/lib/format';
import { lightColors as brand, fontFamily } from '@/theme';

/**
 * The year on one 9:16 card, for Instagram Stories: the four biggest numbers
 * in a grid, the streak and the busiest month underneath, whose year it was.
 * Fixed brand colours, like every shared card.
 */
export function WrappedCard({ year, me, width }: { year: YearInTennis; me?: User; width: number }) {
  const u = width / 360;
  const figures: [string, string][] = [];
  if (year.days) figures.push([String(year.days), year.days === 1 ? 'day playing' : 'days playing']);
  if (year.hours) figures.push([String(year.hours), year.hours === 1 ? 'hour on court' : 'hours on court']);
  if (year.clips) figures.push([String(year.clips), year.clips === 1 ? 'clip posted' : 'clips posted']);
  if (year.matchesPlayed) figures.push([`${year.matchesWon}–${year.matchesPlayed - year.matchesWon}`, 'match record']);
  if (year.views && figures.length < 4) figures.push([compactNumber(year.views), 'views']);
  if (year.likes && figures.length < 4) figures.push([compactNumber(year.likes), 'likes']);
  const lines = [year.longestStreak >= 2 ? `Longest streak: ${year.longestStreak} days` : null, year.busiestMonth ? `Busiest month: ${year.busiestMonth}` : null].filter(Boolean);
  return (
    <View collapsable={false} style={{ width, height: Math.round((width * 16) / 9), overflow: 'hidden' }}>
      <LinearGradient colors={[brand.brand, '#16281C', '#0B120E']} locations={[0, 0.55, 1]} style={StyleSheet.absoluteFill} />
      <View style={{ position: 'absolute', right: -60 * u, top: 90 * u, width: 300 * u, height: 300 * u, borderRadius: 150 * u, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.1)' }} />
      <View style={{ position: 'absolute', right: -10 * u, top: 140 * u, width: 200 * u, height: 200 * u, borderRadius: 100 * u, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.08)' }} />
      <View style={{ flex: 1, padding: 26 * u, justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <Text style={{ fontFamily: fontFamily.bold, fontWeight: '700', fontSize: 20 * u, color: 'white', letterSpacing: -0.3 * u }}>CourtSide</Text>
          <Text style={{ fontFamily: fontFamily.bold, fontWeight: '700', fontSize: 20 * u, color: 'rgba(255,255,255,0.7)', fontVariant: ['tabular-nums'] }}>{year.year}</Text>
        </View>
        <View style={{ gap: 26 * u }}>
          <Text style={{ fontFamily: fontFamily.bold, fontWeight: '700', fontSize: 40 * u, lineHeight: 42 * u, letterSpacing: -1.2 * u, color: 'white' }}>My year{'\n'}in tennis</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 22 * u }}>
            {figures.slice(0, 4).map(([n, label]) => (
              <View key={label} style={{ width: '50%', gap: 2 * u }}>
                <Text style={{ fontFamily: fontFamily.bold, fontWeight: '700', fontSize: 44 * u, lineHeight: 50 * u, letterSpacing: -1.2 * u, color: 'white', fontVariant: ['tabular-nums'] }}>{n}</Text>
                <Text style={{ fontFamily: fontFamily.medium, fontSize: 14 * u, color: 'rgba(255,255,255,0.72)' }}>{label}</Text>
              </View>
            ))}
          </View>
          {lines.length ? (
            <View style={{ gap: 6 * u, paddingTop: 16 * u, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.16)' }}>
              {lines.map((l) => <Text key={l!} style={{ fontFamily: fontFamily.semibold, fontWeight: '600', fontSize: 15 * u, color: 'white' }}>{l}</Text>)}
            </View>
          ) : null}
        </View>
        <View style={{ gap: 4 * u }}>
          {me?.handle ? <Text style={{ fontFamily: fontFamily.semibold, fontWeight: '600', fontSize: 14 * u, color: 'white' }}>@{me.handle}</Text> : null}
          <Text style={{ fontFamily: fontFamily.medium, fontSize: 11 * u, color: 'rgba(255,255,255,0.6)' }}>app.courtsidebase.com</Text>
        </View>
      </View>
    </View>
  );
}
