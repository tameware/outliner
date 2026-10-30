/**
 * Example cloud configuration (optional).
 *
 * For local experiments:
 *   cp config.example.js config.local.js
 *
 * Create an OAuth 2.0 Web client ID in Google Cloud Console, enable the
 * Google Drive API, and add your origin under Authorized JavaScript origins.
 * Scope used: https://www.googleapis.com/auth/drive.file
 *
 * `config.local.js` is gitignored. The public repo keeps config.js as null.
 *
 * @type {import('./cloud.js').CloudConfig}
 */
export default {
  googleClientId: 'YOUR_CLIENT_ID.apps.googleusercontent.com',
  // App Engine (or other) SA email granted writer on opaque edit share links
  // (PUT /api/outliner/drive/edit/<token>).
  driveWriterServiceAccount: 'your-project@appspot.gserviceaccount.com',
};
