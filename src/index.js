'use strict';

/**
 * @module depcheck-cli
 * @description Find unused and missing dependencies in Node.js projects.
 * @author idirdev
 */

const fs = require('fs');
const path = require('path');

/** Node.js built-in module names (Node 20+). */
const BUILTINS = new Set([
  'assert', 'buffer', 'child_process', 'cluster', 'console', 'constants',
  'crypto', 'dgram', 'diagnostics_channel', 'dns', 'domain', 'events',
  'fs', 'http', 'http2', 'https', 'inspector', 'module', 'net', 'os',
  'path', 'perf_hooks', 'process', 'punycode', 'querystring', 'readline',
  'repl', 'stream', 'string_decoder', 'sys', 'timers', 'tls', 'trace_events',
  'tty', 'url', 'util', 'v8', 'vm', 'wasi', 'worker_threads', 'zlib',
  'node:assert', 'node:buffer', 'node:child_process', 'node:cluster',
  'node:crypto', 'node:dns', 'node:events', 'node:fs', 'node:http',
  'node:http2', 'node:https', 'node:module', 'node:net', 'node:os',
  'node:path', 'node:process', 'node:readline', 'node:stream', 'node:tls',
  'node:url', 'node:util', 'node:v8', 'node:vm', 'node:worker_threads',
  'node:zlib'
]);

/**
 * Determine if a module name is a Node.js built-in.
 * @param {string} name - Module name
 * @returns {boolean}
 */
function isBuiltinModule(name) {
  if (BUILTINS.has(name)) return true;
  if (name.startsWith('node:')) return true;
  return false;
}

/**
 * Parse require() and import statements from a JS/TS file.
 * @param {string} filePath - Absolute path to the file
 * @returns {string[]} List of imported module names
 */
function findImports(filePath) {
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch {
    return [];
  }

  const imports = new Set();

  // require('...') and require("...")
  const requireRe = /require\s*\(\s*['"`]([^'"`\n]+)['"`]\s*\)/g;
  let m;
  while ((m = requireRe.exec(content)) !== null) {
    imports.add(m[1]);
  }

  // import ... from '...' and import '...'
  const importRe = /import\s+(?:[\s\S]*?from\s+)?['"`]([^'"`\n]+)['"`]/g;
  while ((m = importRe.exec(content)) !== null) {
    imports.add(m[1]);
  }

  // export ... from '...'
  const exportRe = /export\s+(?:[\s\S]*?from\s+)?['"`]([^'"`\n]+)['"`]/g;
  while ((m = exportRe.exec(content)) !== null) {
    imports.add(m[1]);
  }

  // Normalize: extract package name (strip subpaths, handle scoped)
  const normalized = new Set();
  for (const imp of imports) {
    if (imp.startsWith('.') || imp.startsWith('/')) continue;
    const name = imp.startsWith('@')
      ? imp.split('/').slice(0, 2).join('/')
      : imp.split('/')[0];
    normalized.add(name);
  }

  return [...normalized];
}

/**
 * Read package.json and return declared dependencies.
 * @param {string} dir - Project root directory
 * @returns {{ dependencies: object, devDependencies: object, name: string }}
 */
function getPackageDeps(dir) {
  const pkgPath = path.join(dir, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    throw new Error(`No package.json found in ${dir}`);
  }
  const raw = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  return {
    name: raw.name || path.basename(dir),
    dependencies: raw.dependencies || {},
    devDependencies: raw.devDependencies || {}
  };
}

/**
 * Recursively collect all JS/TS files in a directory.
 * @param {string} dir
 * @param {object} [opts]
 * @param {string[]} [opts.ignore] - Directory names to skip
 * @returns {string[]}
 */
function collectFiles(dir, opts = {}) {
  const ignore = new Set(opts.ignore || ['node_modules', '.git', 'dist', 'build', 'coverage']);
  const results = [];

  function walk(current) {
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (ignore.has(entry.name)) continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (/\.(js|ts|mjs|cjs|jsx|tsx)$/.test(entry.name)) {
        results.push(full);
      }
    }
  }

  walk(dir);
  return results;
}

/**
 * Scan a directory and collect all unique imports across all JS/TS files.
 * @param {string} dir - Project root
 * @param {object} [opts]
 * @param {string[]} [opts.ignore] - Packages to ignore
 * @returns {{ usedModules: string[], fileCount: number }}
 */
function scanDir(dir, opts = {}) {
  const files = collectFiles(dir, opts);
  const allImports = new Set();

  for (const file of files) {
    for (const imp of findImports(file)) {
      allImports.add(imp);
    }
  }

  return {
    usedModules: [...allImports],
    fileCount: files.length
  };
}

/**
 * Find declared dependencies that are never imported in code.
 * @param {object} declared - { dep: version } map
 * @param {string[]} used - List of used module names
 * @returns {string[]}
 */
function findUnused(declared, used) {
  const usedSet = new Set(used);
  return Object.keys(declared).filter(dep => !usedSet.has(dep));
}

/**
 * Find imports that are not declared in package.json (excluding builtins).
 * @param {object} declared - Combined dependencies map
 * @param {string[]} used - List of used module names
 * @returns {string[]}
 */
function findMissing(declared, used) {
  const declaredSet = new Set(Object.keys(declared));
  return used.filter(m => !declaredSet.has(m) && !isBuiltinModule(m));
}

/**
 * Filter check results by dependency type.
 * @param {{ unused: object, missing: string[] }} results
 * @param {'dependencies'|'devDependencies'} type
 * @param {object} pkgDeps - { dependencies, devDependencies }
 * @returns {string[]}
 */
function filterByType(results, type, pkgDeps) {
  const group = pkgDeps[type] || {};
  return results.unused.filter(dep => Object.prototype.hasOwnProperty.call(group, dep));
}

/**
 * Format a human-readable report.
 * @param {object} results
 * @returns {string}
 */
function formatReport(results) {
  const lines = [
    '='.repeat(50),
    '  Dependency Check Report',
    '='.repeat(50),
    `  Project: ${results.projectName}`,
    `  Files scanned: ${results.fileCount}`,
    ''
  ];

  if (results.unused.length === 0) {
    lines.push('[OK] No unused dependencies found');
  } else {
    lines.push(`[WARN] Unused dependencies (${results.unused.length}):`);
    results.unused.forEach(d => lines.push(`  - ${d}`));
  }

  lines.push('');

  if (results.missing.length === 0) {
    lines.push('[OK] No missing dependencies found');
  } else {
    lines.push(`[WARN] Missing dependencies (${results.missing.length}):`);
    results.missing.forEach(d => lines.push(`  - ${d}`));
  }

  lines.push('');
  lines.push(summary(results));
  return lines.join('\n');
}

/**
 * Return a one-line summary.
 * @param {object} results
 * @returns {string}
 */
function summary(results) {
  return `Summary: ${results.unused.length} unused, ${results.missing.length} missing — ${results.fileCount} files scanned`;
}

/**
 * Run the full dependency check on a project directory.
 * @param {string} dir - Project root
 * @param {object} [opts]
 * @param {string[]} [opts.ignore] - Packages to ignore
 * @param {boolean} [opts.skipDev] - Skip devDependencies
 * @returns {object} Results report
 */
function checkDeps(dir, opts = {}) {
  const { ignore = [], skipDev = false } = opts;
  const pkgDeps = getPackageDeps(dir);
  const { usedModules, fileCount } = scanDir(dir, { ignore });

  const declared = {
    ...pkgDeps.dependencies,
    ...(skipDev ? {} : pkgDeps.devDependencies)
  };

  const ignoreSet = new Set(ignore);
  const usedFiltered = usedModules.filter(m => !ignoreSet.has(m));

  const unused = findUnused(declared, usedFiltered);
  const missing = findMissing(declared, usedFiltered);

  const results = {
    projectName: pkgDeps.name,
    fileCount,
    unused,
    missing,
    usedModules: usedFiltered
  };

  return {
    ...results,
    report: formatReport(results),
    summary: summary(results)
  };
}

module.exports = {
  checkDeps, findImports, getPackageDeps, scanDir, collectFiles,
  findUnused, findMissing, isBuiltinModule, filterByType,
  formatReport, summary
};
