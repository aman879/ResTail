/**
 * One-time "what's new" announcement for users who update from an older version.
 * Chrome updates extensions in the background, so this reaches users who haven't
 * opened the popup in a while: a tab on update, a toolbar badge, and a popup banner.
 */

/** Users updating from a version below this see the announcement. */
export const ANNOUNCE_VERSION = '1.3.0';
export const WHATS_NEW_PAGE = 'whats-new.html';

const KEY = 'announcement';

export interface AnnouncementState {
  version: string;
  /** Toolbar badge stays until the popup is opened. */
  badge: boolean;
  /** Popup banner stays until dismissed. */
  banner: boolean;
}

/** True when `a` is an older version than `b` ("1.2.0" < "1.3.0"). */
export function isOlderVersion(a: string, b: string): boolean {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d < 0;
  }
  return false;
}

export async function getAnnouncement(): Promise<AnnouncementState | null> {
  const { [KEY]: state } = await chrome.storage.local.get(KEY);
  return state && (state as AnnouncementState).version === ANNOUNCE_VERSION ? (state as AnnouncementState) : null;
}

async function update(patch: Partial<AnnouncementState>) {
  const current = await getAnnouncement();
  if (current) await chrome.storage.local.set({ [KEY]: { ...current, ...patch } });
}

export async function showBadge() {
  await chrome.action.setBadgeBackgroundColor({ color: '#09090b' });
  await chrome.action.setBadgeTextColor?.({ color: '#ffffff' });
  await chrome.action.setBadgeText({ text: 'NEW' });
}

/** Service worker: on update from an older version, start the announcement. */
export async function startAnnouncement(previousVersion: string | undefined) {
  if (!previousVersion || !isOlderVersion(previousVersion, ANNOUNCE_VERSION)) return;
  if (await getAnnouncement()) return; // already announced (e.g. reloaded during development)
  await chrome.storage.local.set({ [KEY]: { version: ANNOUNCE_VERSION, badge: true, banner: true } satisfies AnnouncementState });
  await showBadge();
  await chrome.tabs.create({ url: chrome.runtime.getURL(WHATS_NEW_PAGE), active: true });
}

/** Service worker: badges don't survive a browser restart, so restore a pending one. */
export async function restoreBadge() {
  if ((await getAnnouncement())?.badge) await showBadge();
}

/** Popup opened: the badge has done its job. */
export async function clearBadge() {
  await chrome.action.setBadgeText({ text: '' });
  await update({ badge: false });
}

export async function dismissBanner() {
  await update({ banner: false });
}

export function openWhatsNew() {
  chrome.tabs.create({ url: chrome.runtime.getURL(WHATS_NEW_PAGE) });
}
