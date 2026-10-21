/**
 * Optional Firebase Auth adapter (Google sign-in).
 * Loaded only when cloud config includes a `firebase` block.
 */

/**
 * @param {import('https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js')} authModule
 * @param {import('https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js')} appModule
 * @param {object} firebaseConfig
 */
export async function createFirebaseAuth(firebaseConfig, modules) {
  const { initializeApp } = modules.app;
  const {
    getAuth,
    GoogleAuthProvider,
    signInWithPopup,
    signOut,
    onAuthStateChanged,
  } = modules.auth;

  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const provider = new GoogleAuthProvider();

  return {
    onAuthStateChanged(cb) {
      return onAuthStateChanged(auth, cb);
    },
    async signInWithGoogle() {
      const result = await signInWithPopup(auth, provider);
      return result.user;
    },
    async signOut() {
      await signOut(auth);
    },
    async getIdToken() {
      const user = auth.currentUser;
      if (!user) return null;
      return user.getIdToken();
    },
  };
}

/** Auth stub when Firebase is not configured — UI can still mount for local OPML-only use. */
export function createNullAuth() {
  return {
    onAuthStateChanged(cb) {
      cb(null);
      return () => {};
    },
    async signInWithGoogle() {
      throw new Error('Cloud auth is not configured');
    },
    async signOut() {},
    async getIdToken() {
      return null;
    },
  };
}
