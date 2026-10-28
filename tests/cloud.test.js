import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isCloudConfigured,
  outlineIdFromLocation,
  locationWithOutlineId,
  isReadOnlyViewFromLocation,
  isEditableShareFromLocation,
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

  it('builds a URL that carries the outline id', () => {
    const href = locationWithOutlineId(
      { pathname: '/outliner/', search: '?view=1&edit=e', hash: '' },
      'xyz',
    );
    assert.equal(href, '/outliner/?id=xyz');
  });

  it('builds a read-only share URL with view=1', () => {
    assert.equal(
      locationWithOutlineId(
        { pathname: '/outliner/', search: '', hash: '' },
        'xyz',
        { readOnly: true },
      ),
      '/outliner/?id=xyz&view=1',
    );
  });
});

describe('read-only view flag', () => {
  it('detects view=1', () => {
    assert.equal(isReadOnlyViewFromLocation({ search: '?id=a&view=1' }), true);
    assert.equal(isReadOnlyViewFromLocation({ search: '?id=a' }), false);
    assert.equal(isReadOnlyViewFromLocation({ search: '?view=share-tok' }), false);
  });
});

describe('editable share flag', () => {
  it('is true for ?id= without view=1', () => {
    assert.equal(isEditableShareFromLocation({ search: '?id=a' }), true);
    assert.equal(isEditableShareFromLocation({ search: '?id=a&view=1' }), false);
    assert.equal(isEditableShareFromLocation({ search: '' }), false);
  });
});
