/** Remembers whether this tab has moved between app pages, so a page's back button can tell
 * history.back() (stays in the app) from opening the page directly (would leave it). */
let current: string | null = null;
let moved = false;

export function notePath(path: string) {
  if (current !== null && path !== current) moved = true;
  current = path;
}

export const cameFromApp = () => moved;
