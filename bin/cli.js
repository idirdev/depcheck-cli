#!/usr/bin/env node
'use strict';

/**
 * @file depcheck-cli CLI
 * @description CLI for finding unused and missing dependencies.
 * @author idirdev
 */

const path = require('path');
const { checkDeps } = require('../src/index.js');

const args = process.argv.slice(2);
const help = args.includes('--help') || args.includes('-h');
const json = args.includes('--json');
const skipDev = args.includes('--skip-dev');

if (help) {
  console.log(`
Usage: depcheck [dir] [options]

Arguments:
  dir              Project directory (default: current directory)

Options:
  --ignore <list>  Comma-separated packages to ignore
  --skip-dev       Skip devDependencies check
  --json           Output JSON
  -h, --help       Show help

Examples:
  depcheck
  depcheck ./my-project
  depcheck --ignore lodash,chalk --skip-dev
`);
  process.exit(0);
}

const dir = args.find(a => !a.startsWith('--') && !a.startsWith('-')) || process.cwd();
const resolvedDir = path.resolve(dir);

let ignore = [];
if (args.includes('--ignore')) {
  const idx = args.indexOf('--ignore');
  if (args[idx + 1] && !args[idx + 1].startsWith('--')) {
    ignore = args[idx + 1].split(',').map(s => s.trim());
  }
} else {
  const eq = args.find(a => a.startsWith('--ignore='));
  if (eq) ignore = eq.split('=')[1].split(',').map(s => s.trim());
}

try {
  const result = checkDeps(resolvedDir, { ignore, skipDev });
  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(result.report);
  }
} catch (err) {
  console.error('Error:', err.message);
  process.exit(1);
}
