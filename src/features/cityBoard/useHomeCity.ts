import { useApp } from '@/store/AppContext';
import { MOCK_HOME_CITY, cityIdOf } from './mock';

/**
 * DESIGN MOCK. The board's id for your home city: the city on your profile
 * (never where you are right now), or the one a picture asked for.
 */
export function useHomeCityId(): string | null {
  const { currentUser } = useApp();
  return cityIdOf(MOCK_HOME_CITY ?? currentUser?.location);
}
