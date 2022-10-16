import { describe, it, expect } from 'vitest';
import {
  getAllDependencies,
  cleanVersion,
  detectLockFile,
  hasNodeModules,
} from '../src/utils/packageParser';
import type { PackageJson } from '../src/utils/packageParser';

describe('getAllDependencies', () => {
  it('extracts production dependencies', () => {
    const pkg: PackageJson = {
      name: 'test-pkg',
      version: '1.0.0',
      dependencies: {
        express: '^4.18.0',
        lodash: '^4.17.21',
      },
    };

    const deps = getAllDependencies(pkg);
    const prodDeps = deps.filter((d) => d.type === 'production');
    expect(prodDeps).toHaveLength(2);
    expect(prodDeps.map((d) => d.name).sort()).toEqual(['express', 'lodash']);
  });

  it('extracts dev dependencies when includeDevDeps is true', () => {
    const pkg: PackageJson = {
      name: 'test-pkg',
      version: '1.0.0',
      dependencies: { express: '^4.18.0' },
      devDependencies: { typescript: '^5.0.0', vitest: '^2.0.0' },
    };

    const deps = getAllDependencies(pkg, true);
    const devDeps = deps.filter((d) => d.type === 'dev');
    expect(devDeps).toHaveLength(2);
    expect(devDeps.map((d) => d.name).sort()).toEqual(['typescript', 'vitest']);
  });

  it('excludes dev dependencies when includeDevDeps is false', () => {
    const pkg: PackageJson = {
      name: 'test-pkg',
      version: '1.0.0',
      dependencies: { express: '^4.18.0' },
      devDependencies: { typescript: '^5.0.0' },
    };

    const deps = getAllDependencies(pkg, false);
    expect(deps.every((d) => d.type !== 'dev')).toBe(true);
  });

  it('extracts peer dependencies', () => {
    const pkg: PackageJson = {
      name: 'test-pkg',
      version: '1.0.0',
      peerDependencies: { react: '^18.0.0' },
    };

    const deps = getAllDependencies(pkg);
    const peerDeps = deps.filter((d) => d.type === 'peer');
    expect(peerDeps).toHaveLength(1);
    expect(peerDeps[0].name).toBe('react');
    expect(peerDeps[0].versionRange).toBe('^18.0.0');
  });

  it('extracts optional dependencies', () => {
    const pkg: PackageJson = {
      name: 'test-pkg',
      version: '1.0.0',
      optionalDependencies: { fsevents: '^2.3.0' },
    };

    const deps = getAllDependencies(pkg);
    const optionalDeps = deps.filter((d) => d.type === 'optional');
    expect(optionalDeps).toHaveLength(1);
    expect(optionalDeps[0].name).toBe('fsevents');
  });

  it('handles package with no dependencies', () => {
    const pkg: PackageJson = {
      name: 'empty-pkg',
      version: '1.0.0',
    };

    const deps = getAllDependencies(pkg);
    expect(deps).toHaveLength(0);
  });

  it('includes versionRange for each dependency', () => {
    const pkg: PackageJson = {
      name: 'test-pkg',
      version: '1.0.0',
      dependencies: { express: '^4.18.2' },
    };

    const deps = getAllDependencies(pkg);
    expect(deps[0].versionRange).toBe('^4.18.2');
  });

  it('includes all dependency fields in each entry', () => {
    const pkg: PackageJson = {
      name: 'test-pkg',
      version: '1.0.0',
      dependencies: { express: '^4.18.0' },
    };

    const deps = getAllDependencies(pkg);
    expect(deps[0]).toHaveProperty('name');
    expect(deps[0]).toHaveProperty('versionRange');
    expect(deps[0]).toHaveProperty('type');
    expect(deps[0]).toHaveProperty('installedVersion');
    expect(deps[0]).toHaveProperty('license');
    expect(deps[0]).toHaveProperty('description');
  });
});

describe('cleanVersion', () => {
  it('strips caret prefix', () => {
    expect(cleanVersion('^1.2.3')).toBe('1.2.3');
  });

  it('strips tilde prefix', () => {
    expect(cleanVersion('~1.2.3')).toBe('1.2.3');
  });

  it('strips >= prefix', () => {
    expect(cleanVersion('>=1.0.0')).toBe('1.0.0');
  });

  it('strips < prefix', () => {
    expect(cleanVersion('<2.0.0')).toBe('2.0.0');
  });

  it('returns clean version unchanged', () => {
    expect(cleanVersion('1.2.3')).toBe('1.2.3');
  });

  it('handles version with spaces', () => {
    expect(cleanVersion('^1.2.3 ')).toBe('1.2.3');
  });
});

describe('detectLockFile', () => {
  it('returns a string or null', () => {
    const result = detectLockFile();
    // We can't predict which lockfile is present, but it should be one of the valid types or null
    expect(result === null || ['npm', 'yarn', 'pnpm', 'bun'].includes(result)).toBe(true);
  });
});

describe('hasNodeModules', () => {
  it('returns a boolean', () => {
    expect(typeof hasNodeModules()).toBe('boolean');
  });
});
