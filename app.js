    import {
      boot,
      addItemAfter,
      removeItem,
      promoteItem,
      demoteItem,
      toggleItem,
      focusItem,
      downloadOpml,
      readOpmlFile,
      loadOutline,
      toOpml,
      parseOpml,
    } from './outliner.js';
    import {
      isCloudConfigured,
      createCloudClient,
      loadCloudConfig,
      outlineIdFromLocation,
      locationWithOutlineId,
    } from './cloud.js';
    import { mountCloudUi } from './cloud-ui.js';
    import { createFirebaseAuth, createNullAuth } from './auth-firebase.js';

    const api = boot();
    window.__outlinerApi = api;
    const root = api.root;

    let currentOutlineId = outlineIdFromLocation(window.location);
    let currentRevision = null;
    let leaseToken = null;

    function syncUrl(id) {
      currentOutlineId = id;
      const next = locationWithOutlineId(window.location, id);
      window.history.replaceState(null, '', next);
    }

    // Keep outline focus when using the toolbar.
    document.querySelectorAll('.toolbar button, .cloud-bar button').forEach((btn) => {
      btn.addEventListener('mousedown', (event) => event.preventDefault());
    });

    document.getElementById('btn-add').addEventListener('click', () => {
      const item = api.getActiveItem();
      if (item) addItemAfter(item);
    });
    document.getElementById('btn-remove').addEventListener('click', () => {
      const item = api.getActiveItem();
      if (item) removeItem(item);
    });
    document.getElementById('btn-promote').addEventListener('click', () => {
      const item = api.getActiveItem();
      if (item) promoteItem(item);
    });
    document.getElementById('btn-demote').addEventListener('click', () => {
      const item = api.getActiveItem();
      if (item) demoteItem(item);
    });
    document.getElementById('btn-expand-all').addEventListener('click', () => {
      root.querySelectorAll('[data-item][data-has-children="true"]').forEach((item) => {
        if (item.dataset.state === 'collapsed') toggleItem(item);
      });
    });
    document.getElementById('btn-collapse-all').addEventListener('click', () => {
      root.querySelectorAll('[data-item][data-has-children="true"]').forEach((item) => {
        if (item.dataset.state !== 'collapsed') toggleItem(item);
      });
    });

    const fileInput = document.getElementById('file-open');

    document.getElementById('btn-save').addEventListener('click', () => {
      const title = document.title || 'Outline';
      downloadOpml(root, { title, filename: 'outline.opml' });
    });

    document.getElementById('btn-open').addEventListener('click', () => {
      fileInput.click();
    });

    fileInput.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      fileInput.value = '';
      if (!file) return;
      try {
        const tree = await readOpmlFile(file);
        loadOutline(root, tree);
        if (tree.title) document.title = tree.title;
        const first = root.querySelector('[data-item]');
        if (first) focusItem(first);
      } catch (error) {
        window.alert('Could not open OPML file: ' + (error?.message || error));
      }
    });

    const first = root.querySelector('[data-item]');
    if (first) focusItem(first);

    async function initCloud() {
      const cloudConfig = await loadCloudConfig();
      const configured = isCloudConfigured(cloudConfig);
      let auth = createNullAuth();
      let cloud = null;

      if (configured && cloudConfig.firebase) {
        try {
          const [{ initializeApp }, authMod] = await Promise.all([
            import('https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js'),
            import('https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js'),
          ]);
          auth = await createFirebaseAuth(cloudConfig.firebase, {
            app: { initializeApp },
            auth: authMod,
          });
          cloud = createCloudClient({
            apiBase: cloudConfig.apiBase,
            getIdToken: () => auth.getIdToken(),
          });
        } catch (error) {
          console.error('Firebase Auth failed to initialize', error);
        }
      } else if (configured) {
        // apiBase without firebase — still show bar but sign-in will fail clearly
        cloud = createCloudClient({
          apiBase: cloudConfig.apiBase,
          getIdToken: () => auth.getIdToken(),
        });
      }

      mountCloudUi({
        configured,
        auth,
        cloud: cloud || {
          async listOutlines() { return []; },
          async getOutline() { return ''; },
          async createOutline() { return { id: 'local' }; },
          async saveOutline() { return {}; },
          async acquireLock() { return { token: '' }; },
          async releaseLock() {},
        },
        outline: {
          root,
          toOpml: () => toOpml(root, { title: document.title || 'Outline' }),
          parseOpml,
          loadOutline: (tree) => {
            loadOutline(root, tree);
            if (tree.title) document.title = tree.title;
            const item = root.querySelector('[data-item]');
            if (item) focusItem(item);
          },
          getTitle: () => document.title || 'Outline',
          setTitle: (title) => {
            if (title) document.title = title;
          },
          getOutlineId: () => currentOutlineId,
          setOutlineId: (id) => {
            currentOutlineId = id;
          },
          getRevision: () => currentRevision,
          setRevision: (rev) => {
            currentRevision = rev;
          },
          getLeaseToken: () => leaseToken,
          setLeaseToken: (token) => {
            leaseToken = token;
          },
          syncUrl,
        },
      });

      if (configured && cloud && currentOutlineId) {
        // Deep link: load when signed in
        auth.onAuthStateChanged(async (user) => {
          if (!user || !currentOutlineId) return;
          try {
            const opml = await cloud.getOutline(currentOutlineId);
            const tree = parseOpml(opml);
            loadOutline(root, tree);
            if (tree.title) document.title = tree.title;
            const item = root.querySelector('[data-item]');
            if (item) focusItem(item);
          } catch (error) {
            console.warn('Could not load outline from URL', error);
          }
        });
      }
    }

    void initCloud();
