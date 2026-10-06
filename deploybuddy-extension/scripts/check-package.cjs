const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
assert.equal(pkg.name, 'deploybuddy');
assert.equal(pkg.displayName, 'DeployBuddy');
assert.equal(pkg.description, 'Your brutally honest pre-deployment sanity checker.');
assert.equal(pkg.version, '0.1.0');
assert.equal(pkg.publisher, 'precraftslabsPrecraftsDigitalLabs', 'Replace the documented placeholder deliberately before publishing.');
assert.ok(pkg.license && fs.existsSync(path.join(root, 'LICENSE')));
assert.ok(pkg.engines?.vscode && pkg.main);
assert.ok(fs.existsSync(path.join(root, pkg.main)), 'Compile the runtime entry point before package validation.');
assert.ok(pkg.icon && fs.existsSync(path.join(root, pkg.icon)), 'Marketplace icon is required.');
const icon = fs.readFileSync(path.join(root, pkg.icon));
assert.equal(icon.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', 'Extension icon must be a PNG.');
assert.equal(pkg.dependencies, undefined, 'Production extension should not add runtime dependencies without review.');
for (const command of ['deploybuddy.checkDeployment', 'deploybuddy.explainRisk', 'deploybuddy.roastDeployment', 'deploybuddy.prePushCheck', 'deploybuddy.gitHealth', 'deploybuddy.about']) {
  assert.ok(pkg.contributes.commands.some(item => item.command === command), `Missing contributed command ${command}`);
}
for (const file of ['README.md', 'CHANGELOG.md', 'LICENSE', '.vscodeignore']) assert.ok(fs.existsSync(path.join(root, file)), `Missing release file ${file}`);
assert.ok(pkg.scripts?.['package:vsix']);
console.log(`Package metadata OK: ${pkg.displayName} ${pkg.version}; ${pkg.contributes.commands.length} contributed commands.`);
