/**
 * Load ?id= deep-link outlines eagerly (like the old public share path),
 * and retry when auth later delivers a signed-in user.
 */

/**
 * @param {object} options
 * @param {{ onAuthStateChanged?: Function }} options.auth
 * @param {{ getOutline: (id: string) => Promise<{ opml: string, revision?: string | null, title?: string | null }> }} options.cloud
 * @param {() => string | null | undefined} options.getOutlineId
 * @param {(got: { opml: string, revision?: string | null, title?: string | null }) => void | Promise<void>} options.applyOutline
 * @param {(error: unknown) => void} [options.onError]
 */
export function bindDeepLinkOutlineLoad({
  auth,
  cloud,
  getOutlineId,
  applyOutline,
  onError,
}) {
  let loadedForId = null;
  let generation = 0;

  async function tryLoad() {
    const id = getOutlineId?.();
    if (!id || !cloud?.getOutline) return false;
    const gen = ++generation;
    try {
      const got = await cloud.getOutline(id);
      if (gen !== generation) return false;
      await applyOutline(got);
      loadedForId = id;
      return true;
    } catch (error) {
      if (gen === generation) onError?.(error);
      return false;
    }
  }

  // Eager load — do not wait for an auth "change" event.
  const ready = tryLoad();

  const unsub = auth?.onAuthStateChanged?.((user) => {
    if (!user) return undefined;
    const id = getOutlineId?.();
    if (!id || loadedForId === id) return undefined;
    return tryLoad();
  });

  return {
    ready,
    destroy() {
      if (typeof unsub === 'function') unsub();
    },
  };
}
