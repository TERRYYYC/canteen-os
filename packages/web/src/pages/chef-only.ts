/**
 * Entries from the shared pages into the chef back office (#/admin/…).
 * Shared QR links carry no token, so these entries are only made while a token is present.
 * When the session ends on a page that stays mounted (logout, or a 401 clearing the token), they are
 * taken out in place: the page is not redrawn, so unsaved purchase edits and scroll position stay.
 * Presence only, as in the shell: no role is read from the token.
 */
import { onAuthSessionChange, peekToken } from '../admin/token';

export const hasChefToken = (): boolean => peekToken() !== null;

type Held = { deref(): Element | undefined };
/** Weak where the browser has WeakRef, so a page that was left is not kept alive until the session ends. */
const hold = (el: Element): Held => (typeof WeakRef === 'function' ? new WeakRef(el) : { deref: () => el });
const shown = new Set<Held>();

onAuthSessionChange(() => {
  if (hasChefToken()) return;
  for (const held of shown) held.deref()?.remove();
  shown.clear();
});

/** The element `make` builds while a chef token is present; otherwise null and nothing is built. */
export function chefOnly<T extends Element>(make: () => T): T | null {
  if (!hasChefToken()) return null;
  for (const held of shown) if (!held.deref()) shown.delete(held);
  const el = make();
  shown.add(hold(el));
  return el;
}
