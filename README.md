# depcheck-cli

> **[EN]** A CLI tool to detect unused and missing dependencies in Node.js projects by statically analyzing import and require statements against package.json.
> **[FR]** Un outil CLI pour détecter les dépendances inutilisées et manquantes dans les projets Node.js en analysant statiquement les instructions import et require par rapport au package.json.

---

## Features / Fonctionnalités

**[EN]**
- Detect declared dependencies that are never imported in the source code
- Detect packages that are imported but not listed in package.json
- Supports both CommonJS (require) and ESM (import/from) syntax
- Handles scoped packages (@scope/package) correctly
- Ignores Node.js built-in modules (fs, path, os, crypto, etc.)
- Skips node_modules, .git, dist, build, coverage automatically
- Exit code 1 when missing dependencies are found

**[FR]**
- Détecter les dépendances déclarées qui ne sont jamais importées dans le code source
- Détecter les paquets importés mais non listés dans package.json
- Supporte la syntaxe CommonJS (require) et ESM (import/from)
- Gère correctement les paquets scoped (@scope/package)
- Ignore les modules intégrés de Node.js (fs, path, os, crypto, etc.)
- Ignore automatiquement node_modules, .git, dist, build, coverage
- Code de sortie 1 quand des dépendances manquantes sont trouvées

---

## Installation

```bash
npm install -g @idirdev/depcheck-cli
```

---

## CLI Usage / Utilisation CLI

```bash
# Check current directory
# Vérifier le répertoire courant
depcheck

# Check a specific project directory
# Vérifier un répertoire de projet spécifique
depcheck /path/to/project

# Show help / Afficher l'aide
depcheck --help
```

### Example Output / Exemple de sortie

```
$ depcheck /path/to/project
Unused (3):
  lodash
  moment
  uuid

Missing (1):
  chalk

$ depcheck /path/to/clean-project
All dependencies OK
```

---

## API (Programmatic) / API (Programmation)

**[EN]** Use depcheck-cli as a library to integrate dependency validation into your build pipeline.
**[FR]** Utilisez depcheck-cli comme bibliothèque pour intégrer la validation des dépendances dans votre pipeline de build.

```javascript
const { getPackageDeps, findImports, checkDeps } = require('@idirdev/depcheck-cli');

const dir = '/path/to/project';

// Get declared deps from package.json
// Obtenir les dépendances déclarées depuis package.json
const { deps, devDeps } = getPackageDeps(dir);
console.log(Object.keys(deps));    // ['express', 'dotenv', ...]
console.log(Object.keys(devDeps)); // ['jest', 'eslint', ...]

// Find all packages actually imported in source files
// Trouver tous les paquets réellement importés dans les fichiers source
const imports = findImports(dir);
console.log([...imports]); // ['express', 'chalk', 'dotenv', ...]

// Run full dependency check
// Lancer la vérification complète des dépendances
const result = checkDeps(dir);
console.log(result);
// {
//   unused:   ['lodash', 'moment'],
//   missing:  ['chalk'],
//   declared: ['express', 'lodash', 'moment', 'dotenv'],
//   used:     ['express', 'chalk', 'dotenv']
// }

if (result.missing.length) {
  console.error('Install missing deps:', result.missing.join(', '));
  process.exit(1);
}
```

### API Reference

| Function | Parameters | Returns |
|----------|-----------|---------|
| `getPackageDeps(dir)` | project path | `{deps, devDeps}` |
| `findImports(dir, opts?)` | path, `{ignore[]}` | `Set<string>` |
| `checkDeps(dir, opts?)` | path, options | `{unused[], missing[], declared[], used[]}` |

---

## License

MIT - idirdev
