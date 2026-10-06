import type { ID } from '@/data/types';
import { confirmBlock } from '@/lib/confirm';
import { show as showToast } from '@/lib/toast';

/** The one thanks line, wherever something is reported. */
export const REPORT_THANKS = 'Thanks — a person will review this';

/** What the thanks needs to offer Block: the app's own actions do. */
interface BlockActions {
  toggleBlock: (userId: ID) => void;
  /** Read at the moment of the tap, not when the thanks came up. */
  isBlocked: (userId: ID) => boolean;
}

/**
 * Said after any report, the same way everywhere (a post, a profile, a
 * comment, a reply, a thread, a hit, a tip), then, the way Instagram does
 * it, an offer to block whoever it was about too. "Block" on the toast asks
 * first, as blocking always does.
 *
 * Blocking is a toggle underneath, so whether they are blocked is checked
 * again when Block is tapped and again on yes, not only when the thanks
 * came up: someone blocked meanwhile (from their profile, say) stays
 * blocked, and Block never unblocks. Someone already blocked, or nobody to
 * block, gets just the thanks.
 */
export function thankForReport(author?: { id: ID; handle: string } | null, actions?: BlockActions) {
  const offer = !!author && !!actions && !actions.isBlocked(author.id);
  showToast({
    title: REPORT_THANKS,
    icon: 'flag-outline',
    ...(offer ? {
      body: `Block @${author.handle} too?`,
      action: {
        label: 'Block',
        onPress: () => {
          if (actions.isBlocked(author.id)) { showToast({ title: `@${author.handle} is already blocked`, icon: 'ban-outline' }); return; }
          confirmBlock(author, () => { if (!actions.isBlocked(author.id)) actions.toggleBlock(author.id); });
        },
      },
    } : {}),
  });
}
