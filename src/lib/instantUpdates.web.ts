/** The website is simply republished; a browser gets the new code on its next visit. */
export function useInstantUpdates() {}

/** Nothing to wait for on opening: the page that loaded is already the newest (see the phone's version). */
export function useLaunchUpdate(): { holding: boolean; downloading: boolean } {
  return { holding: false, downloading: false };
}
