import chalk from 'chalk';

export interface ReportColumn {
  header: string;
  key: string;
  width?: number;
  align?: 'left' | 'right' | 'center';
  color?: (value: string) => string;
}

/**
 * Render a formatted table to the console with borders.
 */
export function renderTable(columns: ReportColumn[], rows: Record<string, any>[]): void {
  if (rows.length === 0) {
    console.log(chalk.yellow('  No data to display.'));
    return;
  }

  // Calculate column widths
  const widths = columns.map((col) => {
    const headerLen = col.header.length;
    const maxDataLen = rows.reduce((max, row) => {
      const val = stripAnsi(String(row[col.key] ?? ''));
      return Math.max(max, val.length);
    }, 0);
    return col.width || Math.max(headerLen, maxDataLen) + 2;
  });

  // Header
  const headerCells = columns.map((col, i) =>
    padCell(chalk.bold(col.header), widths[i], col.align || 'left')
  );
  console.log(`  ${headerCells.join(chalk.dim(' | '))}`);

  // Separator
  const sep = widths.map((w) => chalk.dim('-'.repeat(w))).join(chalk.dim('-+-'));
  console.log(`  ${sep}`);

  // Rows
  for (const row of rows) {
    const cells = columns.map((col, i) => {
      let val = String(row[col.key] ?? '');
      if (col.color) val = col.color(val);
      return padCell(val, widths[i], col.align || 'left');
    });
    console.log(`  ${cells.join(chalk.dim(' | '))}`);
  }
}

/** Strip ANSI escape codes for length calculation */
function stripAnsi(str: string): string {
  return str.replace(/\u001b\[[0-9;]*m/g, '');
}

/** Pad a cell value to a target width with alignment */
function padCell(value: string, width: number, align: 'left' | 'right' | 'center'): string {
  const stripped = stripAnsi(value);
  const diff = width - stripped.length;
  if (diff <= 0) return value;

  switch (align) {
    case 'right':
      return ' '.repeat(diff) + value;
    case 'center': {
      const left = Math.floor(diff / 2);
      return ' '.repeat(left) + value + ' '.repeat(diff - left);
    }
    default:
      return value + ' '.repeat(diff);
  }
}

/** Print a section header with underline */
export function sectionHeader(title: string): void {
  console.log();
  console.log(chalk.bold.underline(`  ${title}`));
  console.log();
}

/** Print a tool banner */
export function printBanner(projectName: string): void {
  console.log();
  console.log(chalk.bold.cyan('  DepCheck') + chalk.dim(` - ${projectName}`));
  console.log(chalk.dim('  ' + '-'.repeat(40)));
}

/** Render a summary stats block */
export function renderSummary(entries: { label: string; value: string | number; color?: (v: string) => string }[]): void {
  const maxLabelLen = Math.max(...entries.map((e) => e.label.length));
  for (const entry of entries) {
    const label = chalk.dim(entry.label.padEnd(maxLabelLen + 2));
    const valStr = String(entry.value);
    const value = entry.color ? entry.color(valStr) : chalk.white(valStr);
    console.log(`  ${label}${value}`);
  }
}

/** Format severity level with color */
export function formatSeverity(severity: string): string {
  switch (severity.toLowerCase()) {
    case 'critical':
      return chalk.bgRed.white.bold(` ${severity.toUpperCase()} `);
    case 'high':
      return chalk.red.bold(severity);
    case 'moderate':
      return chalk.yellow(severity);
    case 'low':
      return chalk.blue(severity);
    default:
      return chalk.dim(severity);
  }
}

/** Format a dependency type badge */
export function formatDepType(type: string): string {
  switch (type) {
    case 'production':
      return chalk.green('prod');
    case 'dev':
      return chalk.yellow('dev');
    case 'peer':
      return chalk.magenta('peer');
    case 'optional':
      return chalk.dim('opt');
    default:
      return chalk.dim(type);
  }
}

/** Render a progress/status line */
export function statusLine(icon: string, message: string): void {
  console.log(`  ${icon} ${message}`);
}

/** Success icon */
export const PASS = chalk.green('\u2714');
/** Failure icon */
export const FAIL = chalk.red('\u2718');
/** Warning icon */
export const WARN = chalk.yellow('\u26A0');
/** Info icon */
export const INFO = chalk.blue('\u2139');
