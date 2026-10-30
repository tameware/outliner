/**
 * Sync boot (not a module): hide the starter outline before first paint when
 * the URL is a Drive deep link. Module app.js finishes loading later.
 * Keep detection aligned with hasRemoteOutlineParams / viewTokenFromLocation.
 */
(function () {
  try {
    var params = new URLSearchParams(window.location.search || '');
    var id = params.get('id');
    var view = params.get('view');
    var edit = params.get('edit');
    var hasId = Boolean(id && String(id).trim());
    var hasView = Boolean(view && String(view).trim() && String(view).trim() !== '1');
    var hasEdit = Boolean(edit && String(edit).trim());
    if (!hasId && !hasView && !hasEdit) return;

    var main = document.querySelector('main');
    if (main) main.setAttribute('data-loading', 'true');
    var loading = document.getElementById('outline-loading');
    if (loading) loading.hidden = false;
    // Clear before app.js so share links never flash "Untitled".
    var title = document.getElementById('document-title');
    if (title) title.textContent = '';
  } catch (_) {
    /* ignore */
  }
})();
