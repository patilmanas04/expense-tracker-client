// No runtime imports: scripts/check-tags.mjs imports this file with Node.
import type { ActivityRequest } from "@/components/data-provider";

/** What a link asks Activity to show; `requestActivity` adds the nonce. */
export type ActivityLinkRequest = Omit<ActivityRequest, "nonce">;

// Resolves relative links ("/activity?tag=goa"); any other origin isn't ours.
const BASE = "http://folio.invalid";
const BASE_ORIGIN = new URL(BASE).origin;

/**
 * Reads a notification link of the form /activity?kind=review, /activity?tag=goa or
 * /activity?txn=<id> into a request for Activity. null for any other path or origin, which
 * opens as an ordinary link. Unknown parameters are ignored; a bare /activity gives {}.
 */
export function activityRequestFromLink(link: string): ActivityLinkRequest | null {
  let url: URL;
  try {
    url = new URL(link, BASE);
  } catch {
    return null;
  }
  if (url.origin !== BASE_ORIGIN || url.pathname.replace(/\/+$/, "") !== "/activity") return null;
  const request: ActivityLinkRequest = {};
  // Doc 12 adds refund → "REFUND".
  if (url.searchParams.get("kind")?.trim().toLowerCase() === "review") request.kind = "REVIEW";
  const tag = (url.searchParams.get("tag") ?? "").replace(/^#/, "").trim().normalize("NFC").toLowerCase();
  if (tag) request.tag = tag;
  const txn = (url.searchParams.get("txn") ?? "").trim();
  if (txn) request.txn = txn;
  return request;
}
