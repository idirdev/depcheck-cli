# DepCheck CLI

[![npm version](https://img.shields.io/npm/v/@idirdev/depcheck-cli.svg)](https://www.npmjs.com/package/@idirdev/depcheck-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue.svg)](https://www.typescriptlang.org/)

A comprehensive CLI tool to audit, analyze, and maintain your project's dependencies. Detect vulnerabilities, find outdated packages, audit licenses, and identify unused dependencies.

## Features

- **Security Audit** -- Scan dependencies for known vulnerabilities with severity filtering
- **Outdated Detection** -- Find packages with available updates (major/minor/patch)
- **License Compliance** -- Detect licenses across all dependencies with allow-list enforcement
- **Unused Detection** -- Find potentially unused dependencies by scanning source imports
- **JSON Output** -- Machine-readable output for CI/CD pipelines

## Installation

```bash
npm install -g @idirdev/depcheck-cli
```

Or run directly with npx:

```bash
npx @idirdev/depcheck-cli audit
```

## Usage

```bash
# Security vulnerability scan
depcheck audit

# Only high/critical vulnerabilities
depcheck audit --severity high

# Check for outdated packages
depcheck outdated

# Only show major version bumps
depcheck outdated --major

# License compliance check
depcheck licenses

# Fail CI if disallowed licenses found
depcheck licenses --fail

# Find unused dependencies
depcheck unused

# Ignore specific packages
depcheck unused --ignore "typescript,eslint"

# Analyze a different project
depcheck -p /path/to/project audit
```

## Commands

### `depcheck audit [options]`

| Option | Description | Default |
|--------|-------------|---------|
| `--severity <level>` | Minimum severity: low, moderate, high, critical | low |
| `--dev` | Include devDependencies | false |
| `--json` | Output as JSON | false |

### `depcheck outdated [options]`

| Option | Description | Default |
|--------|-------------|---------|
| `--major` | Only show major updates | false |
| `--minor` | Only show minor updates | false |
| `--dev` | Include devDependencies | true |
| `--json` | Output as JSON | false |

### `depcheck licenses [options]`

| Option | Description | Default |
|--------|-------------|---------|
| `--allow <licenses>` | Comma-separated allowed licenses | MIT,ISC,BSD-2-Clause,BSD-3-Clause,Apache-2.0 |
| `--fail` | Exit code 1 if disallowed licenses found | false |
| `--json` | Output as JSON | false |

### `depcheck unused [options]`

| Option | Description | Default |
|--------|-------------|---------|
| `--ignore <packages>` | Comma-separated packages to ignore | -- |
| `--scan-dirs <dirs>` | Directories to scan for imports | src,lib,app,pages,components |
| `--json` | Output as JSON | false |

## Development

```bash
git clone https://github.com/idirdev/depcheck-cli.git
cd depcheck-cli
npm install
npm run dev -- audit
```

## License

MIT
