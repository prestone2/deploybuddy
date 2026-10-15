const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('Node adapter root exports only the stable adapter entry', () => {
  const adapter = require('@deploybuddy/node-adapter');
  assert.equal(typeof adapter.NodeWorkspaceAdapter, 'function');
  assert.deepEqual(Object.keys(adapter), ['NodeWorkspaceAdapter']);
  const declaration = path.resolve(require.resolve('@deploybuddy/node-adapter'), '../index.d.ts');
  assert.ok(fs.existsSync(declaration));
  assert.throws(() => require('@deploybuddy/node-adapter/NodeWorkspaceAdapter'), { code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' });
});

test('workspace configuration is bounded and symbolic links are rejected', async t => {
  const os = require('node:os');
  const { NodeWorkspaceAdapter } = require('@deploybuddy/node-adapter');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'deploybuddy-adapter-safety-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const outside = path.join(root, 'outside.json');
  fs.writeFileSync(outside, JSON.stringify({ version: 1, git: { requireClean: true } }));
  fs.symlinkSync(outside, path.join(root, '.deploybuddy.json'));
  const linked = await new NodeWorkspaceAdapter(root).getPolicy();
  assert.equal(linked.configured, true);
  assert.equal(linked.valid, false);
  fs.unlinkSync(path.join(root, '.deploybuddy.json'));
  fs.writeFileSync(path.join(root, '.deploybuddy.json'), ' '.repeat(256 * 1024 + 1));
  const oversized = await new NodeWorkspaceAdapter(root).getPolicy();
  assert.equal(oversized.valid, false);
  assert.match(oversized.errors[0].message, /size limit/);
});
