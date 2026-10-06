import { confirmBlock } from '@/lib/confirm';
import { show as showToast } from '@/lib/toast';

/** The one thanks line, wherever something is reported. */
export const REPORT_THANKS = 'Thanks — a person will review this';

/**
 * Said after any report, the same way everywhere (a post, a profile, a
 * comment, a reply, a thread, a hit, a tip), then, the way Instagram does
 * it, an offer to block whoever it was about too. "Block" on the toast asks
 * first, as blocking always does. Pass no `block` for someone already
 * blocked (or nobody to block), and it is just the thanks.
 */
export function thankForReport(author?: { handle: string } | null, block?: () => void) {
  showToast({
    title: REPORT_THANKS,
    icon: 'flag-outline',
    ...(author && block ? { body: `Block @${author.handle} too?`, action: { label: 'Block', onPress: () => confirmBlock(author, block) } } : {}),
  });
}
