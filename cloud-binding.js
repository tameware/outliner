/**
 * Drop the association with the currently open Drive outline.
 * Used when File Open replaces the document so Cloud Save creates a new file
 * instead of overwriting the previously opened one.
 *
 * @param {{
 *   setOutlineId?: (id: string | null) => void,
 *   setRevision?: (rev: string | number | null) => void,
 *   setLeaseToken?: (token: string | null) => void,
 *   syncUrl?: (id: string | null) => void,
 * } | null | undefined} outline
 */
export function clearCloudOutlineBinding(outline) {
  if (!outline) return;
  outline.setOutlineId?.(null);
  outline.setRevision?.(null);
  outline.setLeaseToken?.(null);
  outline.syncUrl?.(null);
}
