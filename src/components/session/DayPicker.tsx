import React, { useMemo, useState } from 'react';

import { Tiles } from '@/components/sheet/SheetForm';
import { localDay } from '@/features/practice/stats';
import * as haptics from '@/lib/haptics';

/** How far back the row goes: four weeks and a bit, more than the "at least two weeks" asked for. */
const BACK = 30;
/** The furthest back a session already in your log can sit (the app loads about 400 days of it). */
const LONGEST = 400;

/** The day `n` days before today, on this phone's calendar (a clock change never skips or repeats a day). */
function daysAgo(n: number): Date {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return d;
}

/**
 * Which day a session you log by hand was played (Oct 6, owner: "the when
 * thing needs some work"): Today, Yesterday, then a tile a day going back
 * four weeks, in the same tiles as Looking for a hit's days. Swipe the row
 * for an older day; never one still to come. A month's first tile going back
 * says the month ("Sep 30") so the row never reads as one long month. Opened
 * on an older day (a session being edited), the row starts at it.
 */
export function DayPicker({ value, onChange }: { value: string; onChange: (day: string) => void }) {
  // The day it opened on stays on the row after another is picked, however far back it was.
  const [first] = useState(value);
  const options = useMemo(() => {
    // Long enough to hold that day, when it is further back than the usual four weeks.
    let count = BACK;
    if (first < localDay(daysAgo(BACK - 1))) {
      while (count < LONGEST && localDay(daysAgo(count - 1)) > first) count += 1;
    }
    return Array.from({ length: count }, (_, i) => {
      const d = daysAgo(i);
      const day = localDay(d);
      const newMonth = i > 1 && d.getMonth() !== daysAgo(i - 1).getMonth();
      const long = d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
      return {
        value: day,
        top: i === 0 ? 'Today' : i === 1 ? 'Yesterday' : newMonth ? d.toLocaleDateString(undefined, { month: 'short' }) : d.toLocaleDateString(undefined, { weekday: 'short' }),
        main: String(d.getDate()),
        label: i === 0 ? `Today, ${long}` : i === 1 ? `Yesterday, ${long}` : long,
      };
    });
  }, [first]);
  return (
    <Tiles
      scroll
      reveal
      value={value}
      onChange={(day) => { if (day !== value) { haptics.untap(); onChange(day); } }}
      options={options}
    />
  );
}
