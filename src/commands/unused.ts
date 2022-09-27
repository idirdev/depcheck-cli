import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import {
  readPackageJson,
  getAllDependencies,
  DependencyEntry,
} from '../utils/packageParser';
import {
  renderTable,
  ReportColumn,
  sectionHeader,
  printBanner,
  renderSummary,
  formatDepType,
  statusLine,
  PASS,
  WARN,
  INFO,
} from '../utils/reporter';

interface UnusedOptions {
  ignore?: string;
  scanDirs?: string;
  json?: boolean;
}

/**
 * Recursively collect all source files from given directories.
 */
function collectSourceFiles(dirs: string[], extensions: string[]): string[] {
  const files: string[] = [];

  function walk(dir: string): void {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        // Skip common non-source directories
        if (['node_modules', '.git', 'dist', 'build', 'coverage', '.next', '.nuxt'].includes(entry.name)) {
          continue;
        }
        walk(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (extensions.includes(ext)) {
          files.push(fullPath);
        }
      }
    }
  }

  for (const dir of dirs) {
    walk(path.resolve(dir));
  }

  return files;
}

/**
 * Scan file contents for import/require statements referencing a package.
 * Returns the set of package names that are referenced.
 */
function scanImports(files: string[]): Set<string> {
  const imports = new Set<string>();

  // Patterns to match:
  // - import ... from 'package'
  // - import 'package'
  // - require('package')
  // - import('package')  (dynamic import)
  const importPatterns = [
    /from\s+['"]([^'"./][^'"]*)['"]/g,          // import ... from 'pkg'
    /import\s+['"]([^'"./][^'"]*)['"]/g,          // import 'pkg'
    /require\s*\(\s*['"]([^'"./][^'"]*)['"]\s*\)/g, // require('pkg')
    /import\s*\(\s*['"]([^'"./][^'"]*)['"]\s*\)/g,  // import('pkg')
  ];

  for (const file of files) {
    let content: string;
    try {
      content = fs.readFileSync(file, 'utf-8');
    } catch {
      continue;
    }

    for (const pattern of importPatterns) {
      let match: RegExpExecArray | null;
      // Reset lastIndex for global regex
      pattern.lastIndex = 0;
      while ((match = pattern.exec(content)) !== null) {
        const importPath = match[1];
        // Extract the package name (handle scoped packages like @scope/name)
        if (importPath.startsWith('@')) {
          const parts = importPath.split('/');
          if (parts.length >= 2) {
            imports.add(`${parts[0]}/${parts[1]}`);
          }
        } else {
          const parts = importPath.split('/');
          imports.add(parts[0]);
        }
      }
    }
  }

  return imports;
}

/**
 * Check if a package is used in scripts (package.json scripts).
 */
function isUsedInScripts(packageName: string, scripts: Record<string, string>): boolean {
  for (const script of Object.values(scripts)) {
    if (script.includes(packageName)) {
      return true;
    }
  }
  return false;
}

/** Well-known packages that are often used implicitly (plugins, presets, etc.) */
const IMPLICIT_USAGE_PACKAGES = new Set([
  'typescript',
  'ts-node',
  '@types/node',
  'eslint',
  'prettier',
  'jest',
  'mocha',
  'vitest',
  'husky',
  'lint-staged',
  'nodemon',
  'rimraf',
  'cross-env',
  'dotenv',
  'tslib',
  '@babel/core',
  '@babel/preset-env',
  'webpack',
  'vite',
  'tailwindcss',
  'postcss',
  'autoprefixer',
]);

export async function unusedCommand(options: UnusedOptions): Promise<void> {
  const pkg = readPackageJson();
  const deps = getAllDependencies(pkg, true);
  const ignoreList = (options.ignore || '').split(',').map((s) => s.trim()).filter(Boolean);
  const scanDirs = (options.scanDirs || 'src,lib,app,pages,components').split(',').map((s) => s.trim());

  // Collect source files
  const sourceExtensions = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.vue', '.svelte'];
  const sourceFiles = collectSourceFiles(scanDirs, sourceExtensions);

  // Scan imports in all source files
  const usedImports = scanImports(sourceFiles);

  // Check each dependency
  const results: {
    name: string;
    type: string;
    status: 'used' | 'unused' | 'implicit' | 'ignored';
    usedIn: string;
  }[] = [];

  const scripts = pkg.scripts || {};

  for (const dep of deps) {
    if (ignoreList.includes(dep.name)) {
      results.push({ name: dep.name, type: dep.type, status: 'ignored', usedIn: 'ignore list' });
      continue;
    }

    if (usedImports.has(dep.name)) {
      results.push({ name: dep.name, type: dep.type, status: 'used', usedIn: 'source imports' });
      continue;
    }

    if (isUsedInScripts(dep.name, scripts)) {
      results.push({ name: dep.name, type: dep.type, status: 'used', usedIn: 'scripts' });
      continue;
    }

    // Check for @types/* packages -- they're used if the corresponding package is used
    if (dep.name.startsWith('@types/')) {
      const basePkg = dep.name.replace('@types/', '').replace('__', '/');
      if (usedImports.has(basePkg)) {
        results.push({ name: dep.name, type: dep.type, status: 'used', usedIn: `types for ${basePkg}` });
        continue;
      }
    }

    if (IMPLICIT_USAGE_PACKAGES.has(dep.name)) {
      results.push({ name: dep.name, type: dep.type, status: 'implicit', usedIn: 'tooling/config' });
      continue;
    }

    results.push({ name: dep.name, type: dep.type, status: 'unused', usedIn: '' });
  }

  const unused = results.filter((r) => r.status === 'unused');
  const implicit = results.filter((r) => r.status === 'implicit');
  const used = results.filter((r) => r.status === 'used');
  const ignored = results.filter((r) => r.status === 'ignored');

  if (options.json) {
    console.log(JSON.stringify({
      project: pkg.name,
      scannedFiles: sourceFiles.length,
      scannedDirectories: scanDirs,
      totalDependencies: deps.length,
      unusedCount: unused.length,
      results: results.map((r) => ({ name: r.name, type: r.type, status: r.status, usedIn: r.usedIn })),
    }, null, 2));
    return;
  }

  printBanner(pkg.name || 'Unknown Project');

  sectionHeader('Unused Dependency Scan');
  renderSummary([
    { label: 'Project', value: `${pkg.name}@${pkg.version}` },
    { label: 'Directories scanned', value: scanDirs.join(', ') },
    { label: 'Source files found', value: sourceFiles.length },
    { label: 'Total dependencies', value: deps.length },
    { label: 'Used (imports)', value: used.length, color: chalk.green },
    { label: 'Implicit (tooling)', value: implicit.length, color: chalk.cyan },
    { label: 'Ignored', value: ignored.length, color: chalk.dim },
    { label: 'Potentially unused', value: unused.length, color: unused.length > 0 ? chalk.red : chalk.green },
  ]);

  if (unused.length === 0) {
    console.log();
    statusLine(PASS, chalk.green('No unused dependencies detected!'));
    console.log();
    return;
  }

  sectionHeader('Potentially Unused Dependencies');

  const columns: ReportColumn[] = [
    { header: 'Package', key: 'name', width: 35, color: chalk.white },
    { header: 'Type', key: 'type', width: 8 },
    { header: 'Status', key: 'status', width: 12 },
  ];

  const rows = unused.map((entry) => ({
    name: entry.name,
    type: formatDepType(entry.type),
    status: chalk.red('unused'),
  }));

  renderTable(columns, rows);

  // Implicit/tooling packages
  if (implicit.length > 0) {
    sectionHeader('Implicit Usage (Tooling/Config)');
    console.log(chalk.dim('  These packages may be used by build tools, config files, or plugins:\n'));
    for (const entry of implicit) {
      statusLine(INFO, `${chalk.white(entry.name)} ${chalk.dim(`(${entry.usedIn})`)}`);
    }
  }

  // Cleanup suggestion
  sectionHeader('Suggested Cleanup');
  const prodUnused = unused.filter((u) => u.type === 'production');
  const devUnused = unused.filter((u) => u.type !== 'production');

  if (prodUnused.length > 0) {
    statusLine(WARN, 'Remove unused production dependencies:');
    console.log(chalk.dim(`    npm uninstall ${prodUnused.map((u) => u.name).join(' ')}`));
  }
  if (devUnused.length > 0) {
    statusLine(WARN, 'Remove unused dev dependencies:');
    console.log(chalk.dim(`    npm uninstall -D ${devUnused.map((u) => u.name).join(' ')}`));
  }

  console.log();
  statusLine(WARN, chalk.yellow('Note: Always verify before removing -- some packages may be used dynamically'));
  console.log();
}
