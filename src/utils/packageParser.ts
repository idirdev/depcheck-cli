import * as fs from 'fs';
import * as path from 'path';

export interface PackageJson {
  name: string;
  version: string;
  description?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
  license?: string;
  [key: string]: any;
}

export interface DependencyEntry {
  name: string;
  versionRange: string;
  type: 'production' | 'dev' | 'peer' | 'optional';
  installedVersion: string | null;
  license: string | null;
  description: string | null;
}

/**
 * Read and parse the package.json from the given directory.
 */
export function readPackageJson(dir: string = '.'): PackageJson {
  const pkgPath = path.resolve(dir, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    throw new Error(`No package.json found at ${pkgPath}. Is this a Node.js project?`);
  }

  const raw = fs.readFileSync(pkgPath, 'utf-8');
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`Failed to parse package.json: ${(err as Error).message}`);
  }
}

/**
 * Get all dependencies with their types from package.json.
 */
export function getAllDependencies(pkg: PackageJson, includeDevDeps: boolean = true): DependencyEntry[] {
  const deps: DependencyEntry[] = [];

  const addDeps = (record: Record<string, string> | undefined, type: DependencyEntry['type']) => {
    if (!record) return;
    for (const [name, versionRange] of Object.entries(record)) {
      deps.push({
        name,
        versionRange,
        type,
        installedVersion: getInstalledVersion(name),
        license: getInstalledLicense(name),
        description: getInstalledDescription(name),
      });
    }
  };

  addDeps(pkg.dependencies, 'production');
  if (includeDevDeps) {
    addDeps(pkg.devDependencies, 'dev');
  }
  addDeps(pkg.peerDependencies, 'peer');
  addDeps(pkg.optionalDependencies, 'optional');

  return deps;
}

/**
 * Attempt to read the installed version of a package from node_modules.
 */
export function getInstalledVersion(packageName: string): string | null {
  try {
    const pkgJsonPath = path.resolve('node_modules', packageName, 'package.json');
    if (!fs.existsSync(pkgJsonPath)) return null;
    const raw = fs.readFileSync(pkgJsonPath, 'utf-8');
    const pkg = JSON.parse(raw);
    return pkg.version || null;
  } catch {
    return null;
  }
}

/**
 * Attempt to read the license of an installed package from node_modules.
 */
export function getInstalledLicense(packageName: string): string | null {
  try {
    const pkgJsonPath = path.resolve('node_modules', packageName, 'package.json');
    if (!fs.existsSync(pkgJsonPath)) return null;
    const raw = fs.readFileSync(pkgJsonPath, 'utf-8');
    const pkg = JSON.parse(raw);

    // License can be a string or an object { type, url }
    if (typeof pkg.license === 'string') return pkg.license;
    if (typeof pkg.license === 'object' && pkg.license?.type) return pkg.license.type;

    // Fallback: check the "licenses" array (deprecated but still used)
    if (Array.isArray(pkg.licenses) && pkg.licenses.length > 0) {
      return pkg.licenses.map((l: any) => l.type || l).join(', ');
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Attempt to read the description of an installed package.
 */
export function getInstalledDescription(packageName: string): string | null {
  try {
    const pkgJsonPath = path.resolve('node_modules', packageName, 'package.json');
    if (!fs.existsSync(pkgJsonPath)) return null;
    const raw = fs.readFileSync(pkgJsonPath, 'utf-8');
    const pkg = JSON.parse(raw);
    return pkg.description || null;
  } catch {
    return null;
  }
}

/**
 * Check if node_modules exists for the current project.
 */
export function hasNodeModules(): boolean {
  return fs.existsSync(path.resolve('node_modules'));
}

/**
 * Get the lock file type if present.
 */
export function detectLockFile(): 'npm' | 'yarn' | 'pnpm' | 'bun' | null {
  if (fs.existsSync(path.resolve('package-lock.json'))) return 'npm';
  if (fs.existsSync(path.resolve('yarn.lock'))) return 'yarn';
  if (fs.existsSync(path.resolve('pnpm-lock.yaml'))) return 'pnpm';
  if (fs.existsSync(path.resolve('bun.lockb'))) return 'bun';
  return null;
}

/**
 * Parse a semver version range into a clean version string.
 * Strips ^, ~, >=, etc. for display purposes.
 */
export function cleanVersion(range: string): string {
  return range.replace(/^[\^~>=<]+/, '').trim();
}
