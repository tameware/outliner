/**
 * Example cloud configuration for GCP App Engine + Firebase Auth.
 *
 * Setup:
 *   cp config.example.js config.local.js
 *   # edit config.local.js with your Firebase + apiBase values
 *
 * `config.local.js` is gitignored so secrets are not pushed.
 * Committed `config.js` stays `null` for the public demo.
 *
 * Also add https://tameware.github.io (and localhost) to Firebase authorized
 * domains and to the API CORS allowlist.
 *
 * @type {import('./cloud.js').CloudConfig}
 */
export default {
  apiBase: 'https://www.tameware.com',
  firebase: {
    apiKey: 'YOUR_API_KEY',
    authDomain: 'YOUR_PROJECT.firebaseapp.com',
    projectId: 'YOUR_PROJECT_ID',
    appId: 'YOUR_APP_ID',
  },
};
