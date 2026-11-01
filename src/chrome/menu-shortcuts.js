/**
 * Platform-aware keyboard shortcut labels for menubar items.
 */

/**
 * @param {Pick<Navigator, 'platform' | 'userAgent'> | { platform?: string, userAgent?: string }} [nav]
 */
export function isMacPlatform(nav = globalThis.navigator) {
  const platform = nav?.platform || '';
  const ua = nav?.userAgent || '';
  return /Mac|iPhone|iPad|iPod/.test(platform) || /Mac OS X/.test(ua);
}

/**
 * @param {string} spec e.g. "mod+z", "shift+tab", "mod+["
 * @param {{ mac?: boolean }} [options]
 */
export function formatMenuShortcut(spec, options = {}) {
  const mac = options.mac ?? isMacPlatform();
  const parts = String(spec)
    .toLowerCase()
    .split('+')
    .map((p) => p.trim())
    .filter(Boolean);

  const hasMod = parts.includes('mod');
  const hasShift = parts.includes('shift');
  const hasAlt = parts.includes('alt');
  const key = parts.find((p) => p !== 'mod' && p !== 'shift' && p !== 'alt' && p !== 'ctrl');

  /** @param {string | undefined} k */
  function formatKey(k) {
    if (!k) return '';
    if (k === 'tab') return mac ? '⇥' : 'Tab';
    if (k === 'up' || k === 'arrowup') return mac ? '↑' : 'Up';
    if (k === 'down' || k === 'arrowdown') return mac ? '↓' : 'Down';
    return k.length === 1 ? k.toUpperCase() : k;
  }

  if (mac) {
    let out = '';
    if (hasAlt) out += '⌥';
    if (hasShift) out += '⇧';
    if (hasMod) out += '⌘';
    out += formatKey(key);
    return out;
  }

  const bits = [];
  if (hasMod) bits.push('Ctrl');
  if (hasAlt) bits.push('Alt');
  if (hasShift) bits.push('Shift');
  const keyLabel = formatKey(key);
  if (keyLabel) bits.push(keyLabel);
  return bits.join('+');
}

/**
 * Fill empty `.menu-shortcut[data-keys]` nodes under `root`.
 * @param {ParentNode | null | undefined} root
 * @param {{ mac?: boolean }} [options]
 */
export function applyMenuShortcuts(root, options = {}) {
  if (!root?.querySelectorAll) return;
  const mac = options.mac ?? isMacPlatform();
  root.querySelectorAll('.menu-shortcut[data-keys]').forEach((el) => {
    const spec = el.getAttribute('data-keys');
    if (!spec) return;
    el.textContent = formatMenuShortcut(spec, { mac });
  });
}
