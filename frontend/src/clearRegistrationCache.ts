/** Clear browser caches so a newly registered user does not see stale client data. */
export async function clearCachesAfterRegistration(): Promise<void> {
  try {
    window.sessionStorage.clear();
  } catch {
    /* ignore */
  }
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (
        k &&
        (k.startsWith("iqfxpro") ||
          k.startsWith("updownfx") ||
          k.startsWith("tradeing") ||
          k.toLowerCase().includes("trading"))
      ) {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach((k) => window.localStorage.removeItem(k));
  } catch {
    /* ignore */
  }
  try {
    if ("caches" in window && typeof caches !== "undefined") {
      const names = await caches.keys();
      await Promise.all(names.map((name) => caches.delete(name)));
    }
  } catch {
    /* ignore */
  }
}
