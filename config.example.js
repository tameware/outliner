/**
 * Example cloud configuration (optional).
 *
 * For local experiments against your own backend:
 *   cp config.example.js config.local.js
 *
 * `config.local.js` is gitignored. The public repo keeps config.js as null.
 * Production for tameware.com is configured in the separate tameware site repo,
 * not here.
 *
 * @type {import('./cloud.js').CloudConfig}
 */
export default {
  apiBase: 'https://api.example.com',
  firebase: {
    apiKey: 'YOUR_API_KEY',
    authDomain: 'YOUR_PROJECT.firebaseapp.com',
    projectId: 'YOUR_PROJECT_ID',
    appId: 'YOUR_APP_ID',
  },
};
