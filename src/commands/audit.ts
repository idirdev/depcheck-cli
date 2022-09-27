import chalk from 'chalk';
import {
  readPackageJson,
  getAllDependencies,
  hasNodeModules,
  detectLockFile,
  DependencyEntry,
} from '../utils/packageParser';
import {
  renderTable,
  ReportColumn,
  sectionHeader,
  printBanner,
  renderSummary,
  formatSeverity,
  formatDepType,
  statusLine,
  PASS,
  FAIL,
  WARN,
  INFO,
} from '../utils/reporter';

interface AuditOptions {
  severity?: string;
  dev?: boolean;
  json?: boolean;
}

type Severity = 'critical' | 'high' | 'moderate' | 'low';

interface VulnerabilityReport {
  package: string;
  severity: Severity;
  title: string;
  cwe: string;
  patchedIn: string;
  recommendation: string;
}

const SEVERITY_ORDER: Record<Severity, number> = {
  critical: 4,
  high: 3,
  moderate: 2,
  low: 1,
};

/**
 * Known vulnerability database (mock).
 * In production, this would call the npm audit API or a vulnerability DB.
 */
const MOCK_VULN_DB: Record<string, VulnerabilityReport[]> = {
  'lodash': [
    {
      package: 'lodash',
      severity: 'high',
      title: 'Prototype Pollution in lodash',
      cwe: 'CWE-1321',
      patchedIn: '>=4.17.21',
      recommendation: 'Upgrade to lodash@4.17.21 or later',
    },
  ],
  'minimist': [
    {
      package: 'minimist',
      severity: 'critical',
      title: 'Prototype Pollution in minimist',
      cwe: 'CWE-1321',
      patchedIn: '>=1.2.6',
      recommendation: 'Upgrade to minimist@1.2.6 or later',
    },
  ],
  'axios': [
    {
      package: 'axios',
      severity: 'moderate',
      title: 'Server-Side Request Forgery in axios',
      cwe: 'CWE-918',
      patchedIn: '>=1.6.0',
      recommendation: 'Upgrade to axios@1.6.0 or later',
    },
  ],
  'express': [
    {
      package: 'express',
      severity: 'low',
      title: 'Open Redirect in express',
      cwe: 'CWE-601',
      patchedIn: '>=4.19.2',
      recommendation: 'Upgrade to express@4.19.2 or later',
    },
  ],
  'tar': [
    {
      package: 'tar',
      severity: 'high',
      title: 'Arbitrary File Creation/Overwrite via insufficient symlink protection',
      cwe: 'CWE-22',
      patchedIn: '>=6.2.1',
      recommendation: 'Upgrade to tar@6.2.1 or later',
    },
  ],
  'node-fetch': [
    {
      package: 'node-fetch',
      severity: 'moderate',
      title: 'Exposure of sensitive information in node-fetch',
      cwe: 'CWE-200',
      patchedIn: '>=2.6.7',
      recommendation: 'Upgrade to node-fetch@2.6.7 or later',
    },
  ],
  'glob-parent': [
    {
      package: 'glob-parent',
      severity: 'high',
      title: 'Regular Expression Denial of Service in glob-parent',
      cwe: 'CWE-1333',
      patchedIn: '>=5.1.2',
      recommendation: 'Upgrade to glob-parent@5.1.2 or later',
    },
  ],
};

export async function auditCommand(options: AuditOptions): Promise<void> {
  const pkg = readPackageJson();
  const includeDev = options.dev || false;
  const minSeverity = (options.severity || 'low') as Severity;
  const minSeverityLevel = SEVERITY_ORDER[minSeverity] || 1;

  const deps = getAllDependencies(pkg, includeDev);
  const lockFile = detectLockFile();
  const hasModules = hasNodeModules();

  // Scan all dependencies against the mock vulnerability DB
  const vulnerabilities: VulnerabilityReport[] = [];
  const scannedPackages = new Set<string>();

  for (const dep of deps) {
    scannedPackages.add(dep.name);
    const vulns = MOCK_VULN_DB[dep.name];
    if (vulns) {
      for (const vuln of vulns) {
        if (SEVERITY_ORDER[vuln.severity] >= minSeverityLevel) {
          vulnerabilities.push(vuln);
        }
      }
    }
  }

  // Sort by severity (critical first)
  vulnerabilities.sort(
    (a, b) => SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity]
  );

  // Count by severity
  const counts: Record<Severity, number> = { critical: 0, high: 0, moderate: 0, low: 0 };
  for (const vuln of vulnerabilities) {
    counts[vuln.severity]++;
  }

  if (options.json) {
    console.log(JSON.stringify({
      project: pkg.name,
      scannedPackages: scannedPackages.size,
      totalVulnerabilities: vulnerabilities.length,
      severityCounts: counts,
      vulnerabilities: vulnerabilities.map((v) => ({
        package: v.package,
        severity: v.severity,
        title: v.title,
        cwe: v.cwe,
        patchedIn: v.patchedIn,
        recommendation: v.recommendation,
      })),
    }, null, 2));
    return;
  }

  printBanner(pkg.name || 'Unknown Project');

  sectionHeader('Audit Configuration');
  renderSummary([
    { label: 'Project', value: pkg.name || 'unknown' },
    { label: 'Version', value: pkg.version || 'unknown' },
    { label: 'Lock file', value: lockFile || 'none detected' },
    { label: 'node_modules', value: hasModules ? chalk.green('present') : chalk.yellow('missing') },
    { label: 'Min severity', value: minSeverity },
    { label: 'Include devDeps', value: includeDev ? 'yes' : 'no' },
    { label: 'Packages scanned', value: scannedPackages.size },
  ]);

  if (vulnerabilities.length === 0) {
    sectionHeader('Results');
    statusLine(PASS, chalk.green(`No vulnerabilities found (scanned ${scannedPackages.size} packages)`));
    console.log();
    return;
  }

  sectionHeader(`Vulnerabilities Found: ${vulnerabilities.length}`);

  // Summary by severity
  renderSummary([
    { label: 'Critical', value: counts.critical, color: counts.critical > 0 ? chalk.bgRed.white : chalk.dim },
    { label: 'High', value: counts.high, color: counts.high > 0 ? chalk.red : chalk.dim },
    { label: 'Moderate', value: counts.moderate, color: counts.moderate > 0 ? chalk.yellow : chalk.dim },
    { label: 'Low', value: counts.low, color: counts.low > 0 ? chalk.blue : chalk.dim },
  ]);

  console.log();

  // Detail table
  const columns: ReportColumn[] = [
    { header: 'Severity', key: 'severity', width: 12 },
    { header: 'Package', key: 'package', width: 20, color: chalk.white },
    { header: 'Title', key: 'title', width: 45 },
    { header: 'CWE', key: 'cwe', width: 10, color: chalk.dim },
  ];

  const rows = vulnerabilities.map((vuln) => ({
    severity: formatSeverity(vuln.severity),
    package: vuln.package,
    title: vuln.title.length > 43 ? vuln.title.slice(0, 40) + '...' : vuln.title,
    cwe: vuln.cwe,
  }));

  renderTable(columns, rows);

  // Recommendations
  sectionHeader('Recommendations');
  const seen = new Set<string>();
  for (const vuln of vulnerabilities) {
    if (!seen.has(vuln.package)) {
      seen.add(vuln.package);
      statusLine(WARN, `${chalk.white(vuln.package)}: ${vuln.recommendation}`);
    }
  }

  console.log();
  if (counts.critical > 0 || counts.high > 0) {
    statusLine(FAIL, chalk.red(`${counts.critical + counts.high} high/critical vulnerabilities require immediate attention`));
  } else {
    statusLine(INFO, chalk.yellow('No critical issues, but consider updating affected packages'));
  }
  console.log();
}
