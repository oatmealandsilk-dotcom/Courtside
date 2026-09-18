import { useState } from 'react';
import { useApp } from '@/store/AppContext';
import { show as showToast } from '@/lib/toast';

/**
 * The map's Location switch. Turning it on asks the device where it is,
 * which can take a few seconds or be refused; the switch says "Finding
 * you…" while it asks, and a refusal is said out loud instead of the
 * switch quietly staying off.
 */
export function useLocationToggle() {
  const { locationEnabled, actions } = useApp();
  const [locating, setLocating] = useState(false);
  const toggle = async () => {
    if (locating) return;
    if (locationEnabled) { void actions.setLocationEnabled(false); return; }
    setLocating(true);
    try {
      const problem = await actions.setLocationEnabled(true);
      if (problem) showToast({ title: 'Location is still off', body: problem, icon: 'navigate-outline' });
    } finally {
      setLocating(false);
    }
  };
  return { locationOn: locationEnabled, locating, toggle };
}
