import chalk from 'chalk';
import * as semver from 'semver';
import {
  readPackageJson,
  getAllDependencies,
  cleanVersion,
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

interface OutdatedOptions {
  major?: boolean;
  minor?: boolean;
  dev?: boolean;
  json?: boolean;
}

interface OutdatedEntry {
  name: string;
  type: string;
  current: string;
  wanted: string;
  latest: string;
  updateType: 'major' | 'minor' | 'patch' | 'prerelease' | 'unknown';
}

/**
 * Mock "latest" version lookup. In production, this would query the npm registry.
 * Returns a simulated newer version based on the current one.
 */
function simulateLatestVersion(packageName: string, currentVersion: string): string {
  const parsed = semver.parse(currentVersion);
  if (!parsed) return currentVersion;

  // Simulate different packages having different update statuses
  const hash = packageName.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const mod = hash % 5;

  switch (mod) {
    case 0: // Major update available
      return `${parsed.major + 1}.0.0`;
    case 1: // Minor update available
      return `${parsed.major}.${parsed.minor + 2}.0`;
    case 2: // Patch update available
      return `${parsed.major}.${parsed.minor}.${parsed.patch + 3}`;
    case 3: // Already up to date
      return currentVersion;
    case 4: // Major + minor
      return `${parsed.major + 1}.${parsed.minor + 1}.0`;
    default:
      return currentVersion;
  }
}

/**
 * Determine the type of version update (major, minor, patch).
 */
function getUpdateType(current: string, latest: string): OutdatedEntry['updateType'] {
  const currentParsed = semver.parse(current);
  const latestParsed = semver.parse(latest);

  if (!currentParsed || !latestParsed) return 'unknown';
  if (semver.eq(currentParsed, latestParsed)) return 'patch'; // same version

  if (latestParsed.major > currentParsed.major) return 'major';
  if (latestParsed.minor > currentParsed.minor) return 'minor';
  if (latestParsed.patch > currentParsed.patch) return 'patch';
  return 'prerelease';
}

/**
 * Color-code the update type.
 */
function colorUpdateType(updateType: string): string {
  switch (updateType) {
    case 'major':
      return chalk.red.bold(updateType);
    case 'minor':
      return chalk.yellow(updateType);
    case 'patch':
      return chalk.green(updateType);
    default:
      return chalk.dim(updateType);
  }
}

export async function outdatedCommand(options: OutdatedOptions): Promise<void> {
  const pkg = readPackageJson();
  const includeDev = options.dev !== false; // include dev by default for outdated
  const deps = getAllDependencies(pkg, includeDev);

  const outdated: OutdatedEntry[] = [];

  for (const dep of deps) {
    const currentClean = dep.installedVersion || cleanVersion(dep.versionRange);
    if (!semver.valid(currentClean)) continue;

    const latest = simulateLatestVersion(dep.name, currentClean);
    const wanted = dep.versionRange.startsWith('^')
      ? `${semver.parse(currentClean)?.major}.x.x`
      : dep.versionRange.startsWith('~')
        ? `${semver.parse(currentClean)?.major}.${semver.parse(currentClean)?.minor}.x`
        : currentClean;

    if (semver.gt(latest, currentClean)) {
      const updateType = getUpdateType(currentClean, latest);

      // Filter by update type if requested
      if (options.major && updateType !== 'major') continue;
      if (options.minor && updateType !== 'minor') continue;

      outdated.push({
        name: dep.name,
        type: dep.type,
        current: currentClean,
        wanted,
        latest,
        updateType,
      });
    }
  }

  // Sort: major first, then minor, then patch
  outdated.sort((a, b) => {
    const order = { major: 0, minor: 1, patch: 2, prerelease: 3, unknown: 4 };
    return (order[a.updateType] ?? 4) - (order[b.updateType] ?? 4);
  });

  // Count by type
  const majorCount = outdated.filter((d) => d.updateType === 'major').length;
  const minorCount = outdated.filter((d) => d.updateType === 'minor').length;
  const patchCount = outdated.filter((d) => d.updateType === 'patch').length;

  if (options.json) {
    console.log(JSON.stringify({
      project: pkg.name,
      totalDependencies: deps.length,
      outdatedCount: outdated.length,
      summary: { major: majorCount, minor: minorCount, patch: patchCount },
      packages: outdated,
    }, null, 2));
    return;
  }

  printBanner(pkg.name || 'Unknown Project');

  sectionHeader('Dependency Update Check');
  renderSummary([
    { label: 'Project', value: `${pkg.name}@${pkg.version}` },
    { label: 'Total dependencies', value: deps.length },
    { label: 'Outdated', value: outdated.length, color: outdated.length > 0 ? chalk.yellow : chalk.green },
    { label: 'Major updates', value: majorCount, color: majorCount > 0 ? chalk.red : chalk.dim },
    { label: 'Minor updates', value: minorCount, color: minorCount > 0 ? chalk.yellow : chalk.dim },
    { label: 'Patch updates', value: patchCount, color: patchCount > 0 ? chalk.green : chalk.dim },
  ]);

  if (outdated.length === 0) {
    console.log();
    statusLine(PASS, chalk.green('All dependencies are up to date!'));
    console.log();
    return;
  }

  sectionHeader('Outdated Packages');

  const columns: ReportColumn[] = [
    { header: 'Package', key: 'name', width: 30, color: chalk.white },
    { header: 'Type', key: 'type', width: 8 },
    { header: 'Current', key: 'current', width: 12, align: 'right', color: chalk.dim },
    { header: 'Latest', key: 'latest', width: 12, align: 'right', color: chalk.green },
    { header: 'Update', key: 'updateType', width: 10, align: 'center' },
  ];

  const rows = outdated.map((entry) => ({
    name: entry.name,
    type: formatDepType(entry.type),
    current: entry.current,
    latest: entry.latest,
    updateType: colorUpdateType(entry.updateType),
  }));

  renderTable(columns, rows);

  // Suggested commands
  sectionHeader('Quick Fix');
  if (majorCount > 0) {
    const majorPkgs = outdated
      .filter((d) => d.updateType === 'major')
      .map((d) => `${d.name}@${d.latest}`)
      .join(' ');
    statusLine(WARN, `Major (review changelog first):`);
    console.log(chalk.dim(`    npm install ${majorPkgs}`));
  }
  if (minorCount > 0 || patchCount > 0) {
    const safePkgs = outdated
      .filter((d) => d.updateType !== 'major')
      .map((d) => `${d.name}@${d.latest}`)
      .join(' ');
    statusLine(INFO, `Safe updates (minor + patch):`);
    console.log(chalk.dim(`    npm install ${safePkgs}`));
  }

  console.log();
}
