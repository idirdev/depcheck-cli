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
  FAIL,
  WARN,
  INFO,
} from '../utils/reporter';

interface LicensesOptions {
  allow?: string;
  fail?: boolean;
  json?: boolean;
}

interface LicenseEntry {
  name: string;
  type: string;
  license: string;
  allowed: boolean;
}

/** Known license categories for grouping */
const LICENSE_CATEGORIES: Record<string, string[]> = {
  'Permissive': ['MIT', 'ISC', 'BSD-2-Clause', 'BSD-3-Clause', 'Apache-2.0', 'Unlicense', '0BSD', 'CC0-1.0'],
  'Copyleft (Weak)': ['LGPL-2.1', 'LGPL-3.0', 'MPL-2.0', 'EPL-1.0', 'EPL-2.0'],
  'Copyleft (Strong)': ['GPL-2.0', 'GPL-3.0', 'AGPL-3.0'],
  'Public Domain': ['Unlicense', 'CC0-1.0', 'WTFPL'],
  'Unknown': ['UNKNOWN'],
};

/** Get the category of a license */
function getLicenseCategory(license: string): string {
  const normalized = license.toUpperCase().trim();
  for (const [category, licenses] of Object.entries(LICENSE_CATEGORIES)) {
    if (licenses.some((l) => normalized.includes(l.toUpperCase()))) {
      return category;
    }
  }
  return 'Other';
}

/** Color a license based on whether it's allowed */
function colorLicense(license: string, allowed: boolean): string {
  if (allowed) return chalk.green(license);
  const category = getLicenseCategory(license);
  if (category === 'Copyleft (Strong)') return chalk.red(license);
  if (category === 'Unknown' || license === 'UNKNOWN') return chalk.yellow(license);
  return chalk.yellow(license);
}

export async function licensesCommand(options: LicensesOptions): Promise<void> {
  const pkg = readPackageJson();
  const deps = getAllDependencies(pkg, true);

  const allowedList = (options.allow || 'MIT,ISC,BSD-2-Clause,BSD-3-Clause,Apache-2.0')
    .split(',')
    .map((l) => l.trim().toUpperCase());

  // Build license entries
  const entries: LicenseEntry[] = deps.map((dep) => {
    const license = dep.license || 'UNKNOWN';
    const normalizedLicense = license.toUpperCase().trim();
    const allowed = allowedList.some((al) => normalizedLicense.includes(al));

    return {
      name: dep.name,
      type: dep.type,
      license,
      allowed,
    };
  });

  // Count by license
  const licenseCounts = new Map<string, number>();
  for (const entry of entries) {
    const lic = entry.license;
    licenseCounts.set(lic, (licenseCounts.get(lic) || 0) + 1);
  }

  // Count by category
  const categoryCounts = new Map<string, number>();
  for (const entry of entries) {
    const cat = getLicenseCategory(entry.license);
    categoryCounts.set(cat, (categoryCounts.get(cat) || 0) + 1);
  }

  const disallowed = entries.filter((e) => !e.allowed);
  const unknown = entries.filter((e) => e.license === 'UNKNOWN');

  if (options.json) {
    console.log(JSON.stringify({
      project: pkg.name,
      totalPackages: entries.length,
      allowedLicenses: allowedList,
      disallowedCount: disallowed.length,
      unknownCount: unknown.length,
      licenseCounts: Object.fromEntries(licenseCounts),
      categoryCounts: Object.fromEntries(categoryCounts),
      disallowedPackages: disallowed.map((e) => ({
        name: e.name,
        license: e.license,
        type: e.type,
      })),
    }, null, 2));
    return;
  }

  printBanner(pkg.name || 'Unknown Project');

  sectionHeader('License Scan');
  renderSummary([
    { label: 'Project', value: `${pkg.name}@${pkg.version}` },
    { label: 'Total packages', value: entries.length },
    { label: 'Allowed licenses', value: allowedList.join(', ') },
    { label: 'Compliant', value: entries.length - disallowed.length, color: chalk.green },
    { label: 'Non-compliant', value: disallowed.length, color: disallowed.length > 0 ? chalk.red : chalk.green },
    { label: 'Unknown license', value: unknown.length, color: unknown.length > 0 ? chalk.yellow : chalk.dim },
  ]);

  // License distribution
  sectionHeader('License Distribution');
  const sortedLicenses = Array.from(licenseCounts.entries())
    .sort((a, b) => b[1] - a[1]);

  const licColumns: ReportColumn[] = [
    { header: 'License', key: 'license', width: 25 },
    { header: 'Count', key: 'count', width: 8, align: 'right', color: chalk.cyan },
    { header: '%', key: 'percent', width: 8, align: 'right', color: chalk.dim },
    { header: 'Status', key: 'status', width: 12 },
    { header: 'Category', key: 'category', width: 20, color: chalk.dim },
  ];

  const licRows = sortedLicenses.map(([license, count]) => {
    const isAllowed = allowedList.some((al) => license.toUpperCase().includes(al));
    return {
      license: colorLicense(license, isAllowed),
      count: String(count),
      percent: ((count / entries.length) * 100).toFixed(1) + '%',
      status: isAllowed ? chalk.green('allowed') : chalk.red('disallowed'),
      category: getLicenseCategory(license),
    };
  });

  renderTable(licColumns, licRows);

  // Category summary
  sectionHeader('Category Summary');
  const sortedCategories = Array.from(categoryCounts.entries())
    .sort((a, b) => b[1] - a[1]);

  for (const [category, count] of sortedCategories) {
    const pct = ((count / entries.length) * 100).toFixed(1);
    const bar = '\u2588'.repeat(Math.round((count / entries.length) * 30));
    const colorFn = category.includes('Strong') ? chalk.red :
      category === 'Permissive' ? chalk.green :
      category === 'Unknown' ? chalk.yellow : chalk.cyan;
    console.log(`  ${category.padEnd(22)} ${colorFn(bar)} ${chalk.dim(`${count} (${pct}%)`)}`);
  }

  // Non-compliant packages detail
  if (disallowed.length > 0) {
    sectionHeader('Non-Compliant Packages');

    const disColumns: ReportColumn[] = [
      { header: 'Package', key: 'name', width: 30, color: chalk.white },
      { header: 'Type', key: 'type', width: 8 },
      { header: 'License', key: 'license', width: 20 },
      { header: 'Category', key: 'category', width: 20 },
    ];

    const disRows = disallowed.map((entry) => ({
      name: entry.name,
      type: formatDepType(entry.type),
      license: chalk.red(entry.license),
      category: getLicenseCategory(entry.license),
    }));

    renderTable(disColumns, disRows);
  }

  // Final verdict
  console.log();
  if (disallowed.length === 0) {
    statusLine(PASS, chalk.green('All packages use approved licenses'));
  } else {
    statusLine(FAIL, chalk.red(`${disallowed.length} package(s) use non-approved licenses`));
    if (unknown.length > 0) {
      statusLine(WARN, chalk.yellow(`${unknown.length} package(s) have unknown licenses -- manual review needed`));
    }
  }
  console.log();

  // Exit with failure code if --fail and disallowed exist
  if (options.fail && disallowed.length > 0) {
    process.exit(1);
  }
}
