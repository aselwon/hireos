import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

function panel() {
  const requests = [];
  const downloads = [];
  const html = { innerHTML: '', querySelector: () => null };
  const application = { id: 'candidate', name: 'Demo', email: 'demo@example.test' };
  const context = {
    document: {
      querySelector: () => html,
      addEventListener: () => undefined,
      createElement: () => ({
        click() {
          downloads.push(this.download);
        },
      }),
    },
    FormData: class {
      constructor(form) {
        this.form = form;
      }
      get(name) {
        return this.form[name];
      }
      has(name) {
        return Boolean(this.form[name]);
      }
    },
    crypto: { randomUUID: () => 'panel-key' },
    clientSelect: () => '',
    clientsPage: () => '',
    submitClientForm: () => Promise.resolve(),
    Blob: globalThis.Blob,
    URL: { createObjectURL: () => 'blob:test', revokeObjectURL: () => undefined },
    setTimeout: (callback) => callback(),
    fetch: (path, options) => {
      requests.push({ path, options });
      let response;
      if (options.method === 'POST') {
        response = { archive: { tables: { applications: [application] }, files: [] } };
      } else if (path.endsWith('/applications')) {
        response = { applications: [application] };
      } else if (path.endsWith('/data-rights')) {
        response = { requests: [] };
      } else {
        response = { brief: { id: 'job', title: 'Demo', stack: [] }, requirements: [] };
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(response) });
    },
  };
  const source = readFileSync(new URL('../hireos/dist/app.js', import.meta.url), 'utf8');
  runInNewContext(
    source
      .replace(/^import .*\n/gm, '')
      .replace(
        /\nawait loadBriefs\(\);\s*$/,
        '\nglobalThis.panel = { state, submitDataRights, dataRightsPanel };'
      ),
    context
  );
  Object.assign(context.panel.state, {
    application,
    brief: { id: 'job', title: 'Demo' },
    loading: false,
  });
  return { ...context.panel, requests, downloads, html };
}

test('panel requires explicit erasure confirmation before calling API', async () => {
  const ui = panel();
  await ui.submitDataRights({
    submitter: { value: 'erase' },
    target: { receivedAt: '2026-01-01' },
  });
  assert.equal(ui.requests.length, 0);
  assert.match(ui.html.innerHTML, /zaznacz potwierdzenie/);
  assert.match(ui.dataRightsPanel(), /Data wpłynięcia/);
  assert.match(ui.dataRightsPanel(), /Rejestr żądań/);
});

test('panel sends dated access request with idempotency key and downloads JSON', async () => {
  const ui = panel();
  const submitter = { value: 'access', disabled: false };
  await ui.submitDataRights({ submitter, target: { receivedAt: '2026-01-01' } });
  const [request] = ui.requests;
  assert.equal(request.path, '/api/v1/applications/candidate/data-rights');
  assert.deepEqual(JSON.parse(request.options.body), { kind: 'access', receivedAt: '2026-01-01' });
  assert.equal(request.options.headers['Idempotency-Key'], 'panel-key');
  assert.deepEqual(ui.downloads, ['dane-kandydata.json']);
  assert.equal(ui.state.view, 'report');
  assert.equal(submitter.disabled, false);
});
