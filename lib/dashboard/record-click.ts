/**
 * Records a link click without delaying navigation. `sendBeacon` queues a POST
 * the browser is guaranteed to send even as the new tab opens; there is no
 * response to read, by design. A dropped beacon simply loses one count — the
 * stored value reconciles on the next page load. Callers optimistically bump
 * their local count separately so the badge updates immediately.
 */
export function recordLinkClick(id: string): void {
  if (typeof navigator === "undefined" || typeof navigator.sendBeacon !== "function") {
    return;
  }

  navigator.sendBeacon(`/api/links/${id}/click`);
}
