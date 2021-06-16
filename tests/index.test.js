'use strict';

/**
 * @file depcheck-cli tests
 * @author idirdev
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  findImports, getPackageDeps, scanDir, findUnused,
  findMissing, isBuiltinModule, checkDeps, formatReport, summary
} = require('../src/index.js');

let tmpDir;

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'depcheck-test-'));

  // package.json
  fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({
    name: 'test-project',
    dependencies: { express: '^4.0.0', lodash: '^4.0.0', chalk: '^5.0.0' },
    devDependencies: { jest: '^29.0.0', 'unused-dev': '^1.0.0' }
  }, null, 2));

  // main file using express and lodash
  fs.writeFileSync(path.join(tmpDir, 'index.js'), `
const express = require('express');
const _ = require('lodash');
const path = require('path');
const missing = require('missing-pkg');
`);

  // another file
  fs.writeFileSync(path.join(tmpDir, 'utils.js'), `
import chalk from 'chalk';
import { something } from 'another-missing';
`);
});

after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('depcheck-cli', () => {
  describe('isBuiltinModule', () => {
    it('identifies core built-ins', () => {
      assert.equal(isBuiltinModule('fs'), true);
      assert.equal(isBuiltinModule('path'), true);
      assert.equal(isBuiltinModule('node:path'), true);
    });

    it('returns false for third-party modules', () => {
      assert.equal(isBuiltinModule('express'), false);
      assert.equal(isBuiltinModule('lodash'), false);
    });
  });

  describe('findImports', () => {
    it('finds require() imports', () => {
      const imports = findImports(path.join(tmpDir, 'index.js'));
      assert.ok(imports.includes('express'));
      assert.ok(imports.includes('lodash'));
    });

    it('finds ES import statements', () => {
      const imports = findImports(path.join(tmpDir, 'utils.js'));
      assert.ok(imports.includes('chalk'));
    });

    it('includes built-in modules in raw import list', () => {
      const imports = findImports(path.join(tmpDir, 'index.js'));
      // findImports returns all imports including builtins; isBuiltinModule filters them downstream
      assert.ok(imports.includes('path'), 'path should be in raw import list');
    });

    it('returns empty array for missing file', () => {
      const imports = findImports('/nonexistent/file.js');
      assert.deepEqual(imports, []);
    });
  });

  describe('getPackageDeps', () => {
    it('reads dependencies from package.json', () => {
      const deps = getPackageDeps(tmpDir);
      assert.ok(deps.dependencies.express);
      assert.ok(deps.dependencies.lodash);
      assert.ok(deps.devDependencies.jest);
    });

    it('throws on missing package.json', () => {
      assert.throws(() => getPackageDeps('/nonexistent/dir'), /No package.json found/);
    });
  });

  describe('findUnused', () => {
    it('finds deps declared but not used', () => {
      const declared = { express: '^4', lodash: '^4', chalk: '^5' };
      const used = ['express', 'lodash'];
      const unused = findUnused(declared, used);
      assert.ok(unused.includes('chalk'));
      assert.ok(!unused.includes('express'));
    });

    it('returns empty when all deps are used', () => {
      const declared = { a: '1', b: '2' };
      const unused = findUnused(declared, ['a', 'b']);
      assert.deepEqual(unused, []);
    });
  });

  describe('findMissing', () => {
    it('finds imports not in declared deps', () => {
      const declared = { express: '^4' };
      const used = ['express', 'missing-pkg'];
      const missing = findMissing(declared, used);
      assert.ok(missing.includes('missing-pkg'));
      assert.ok(!missing.includes('express'));
    });

    it('does not flag built-ins as missing', () => {
      const declared = {};
      const missing = findMissing(declared, ['fs', 'path', 'node:crypto']);
      assert.deepEqual(missing, []);
    });
  });

  describe('scanDir', () => {
    it('scans all JS files in directory', () => {
      const { usedModules, fileCount } = scanDir(tmpDir);
      assert.ok(fileCount >= 2);
      assert.ok(usedModules.includes('express'));
    });
  });

  describe('checkDeps', () => {
    it('returns unused and missing', () => {
      const result = checkDeps(tmpDir);
      assert.ok(Array.isArray(result.unused));
      assert.ok(Array.isArray(result.missing));
      assert.ok(typeof result.report === 'string');
    });

    it('respects ignore option', () => {
      const result = checkDeps(tmpDir, { ignore: ['missing-pkg'] });
      assert.ok(!result.missing.includes('missing-pkg'));
    });
  });

  describe('formatReport', () => {
    it('includes project name and file count', () => {
      const r = { projectName: 'test', fileCount: 5, unused: ['a'], missing: ['b'] };
      const report = formatReport(r);
      assert.ok(report.includes('test'));
      assert.ok(report.includes('5'));
    });
  });

  describe('summary', () => {
    it('returns correct counts', () => {
      const r = { unused: ['a', 'b'], missing: ['c'], fileCount: 10 };
      const s = summary(r);
      assert.ok(s.includes('2 unused'));
      assert.ok(s.includes('1 missing'));
    });
  });
});
