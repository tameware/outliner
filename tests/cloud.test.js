import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isCloudConfigured,
  outlineIdFromLocation,
  locationWithOutlineId,
  isReadOnlyViewFromLocation,
  isEditableShareFromLocation,
  viewTokenFromLocation,
  editTokenFromLocation,
  driveWriterServiceAccountFromConfig,
} from '../cloud.js';

describe('cloud config', () => {
  it('is disabled when config is null or missing googleClientId', () => {
    assert.equal(isCloudConfigured(null), false);
    assert.equal(isCloudConfigured({}), false);
    assert.equal(isCloudConfigured({ googleClientId: '' }), false);
    assert.equal(
      isCloudConfigured({ googleClientId: 'abc.apps.googleusercontent.com' }),
      true,
    );
  });

  it('accepts clientId as an alias for googleClientId', () => {
    assert.equal(
      isCloudConfigured({
        clientId: 'abc.apps.googleusercontent.com',
      }),
      true,
    );
  });

  it('reads driveWriterServiceAccount from config', () => {
    assert.equal(driveWriterServiceAccountFromConfig(null), '');
    assert.equal(
      driveWriterServiceAccountFromConfig({
        driveWriterServiceAccount: ' sa@appspot.gserviceaccount.com ',
      }),
      'sa@appspot.gserviceaccount.com',
    );
  });
});

describe('outline id in URL', () => {
  it('reads id from query string', () => {
    assert.equal(
      outlineIdFromLocation({ search: '?id=abc123', hash: '' }),
      'abc123',
    );
    assert.equal(outlineIdFromLocation({ search: '', hash: '' }), null);
  });

  it('builds a URL that carries the outline id and clears share tokens', () => {
    const href = locationWithOutlineId(
      { pathname: '/outliner/', search: '?view=vt&edit=et', hash: '' },
      'xyz',
    );
    assert.equal(href, '/outliner/?id=xyz');
  });
});

describe('share tokens in URL', () => {
  it('reads opaque view and edit tokens', () => {
    assert.equal(viewTokenFromLocation({ search: '?view=vtov' }), 'vtov');
    assert.equal(editTokenFromLocation({ search: '?edit=etok' }), 'etok');
    assert.equal(viewTokenFromLocation({ search: '?view=1&id=a' }), null);
    assert.equal(editTokenFromLocation({ search: '?id=a' }), null);
  });

  it('treats ?view=TOKEN as read-only and ?edit=TOKEN as editable', () => {
    assert.equal(isReadOnlyViewFromLocation({ search: '?view=vtov' }), true);
    assert.equal(isReadOnlyViewFromLocation({ search: '?id=a' }), false);
    assert.equal(isEditableShareFromLocation({ search: '?edit=etok' }), true);
    assert.equal(isEditableShareFromLocation({ search: '?id=a' }), false);
    assert.equal(isEditableShareFromLocation({ search: '?view=vtov' }), false);
  });

  it('does not treat owner ?id= links as editable guest shares', () => {
    assert.equal(isEditableShareFromLocation({ search: '?id=file-9' }), false);
    assert.equal(isReadOnlyViewFromLocation({ search: '?id=file-9&view=1' }), false);
  });
});
