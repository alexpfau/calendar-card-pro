import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import ts from 'typescript';

export const EDITOR_TRANSLATION_GLOB = '**/src/rendering/editor/translations/*.json';
const DECODER_ID = '\0compact-editor-strings:decoder';
const RELATIVE_KEYS = [
  'future',
  'past',
  's',
  'm',
  'mm',
  'h',
  'hh',
  'd',
  'dd',
  'M',
  'MM',
  'y',
  'yy',
];

function fail(id, message, key) {
  throw new Error(`${id}${key === undefined ? '' : ` [${JSON.stringify(key)}]`}: ${message}`);
}

function walk(node, visit) {
  visit(node);
  ts.forEachChild(node, (child) => walk(child, visit));
}

function parse(code, id, kind = ts.ScriptKind.TS) {
  const ast = ts.createSourceFile(id, code, ts.ScriptTarget.Latest, true, kind);
  if (ast.parseDiagnostics.length) {
    const diagnostic = ast.parseDiagnostics[0];
    const { line, character } = ast.getLineAndCharacterOfPosition(diagnostic.start ?? 0);
    fail(
      id,
      `Invalid syntax at ${line + 1}:${character + 1}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ')}`,
    );
  }
  return ast;
}

function propertyKey(node, id) {
  if (node && (ts.isIdentifier(node) || ts.isStringLiteral(node) || ts.isNumericLiteral(node))) {
    return node.text;
  }
  fail(id, 'Expected a static property key; computed keys and composition are unsupported');
}

function properties(object, id) {
  if (!object || !ts.isObjectLiteralExpression(object)) {
    fail(id, 'Expected an object literal; spreads and composition are unsupported');
  }
  const result = new Map();
  for (const property of object.properties) {
    if (!ts.isPropertyAssignment(property)) {
      fail(
        id,
        'Expected property assignments; spreads, methods, getters, and shorthand are unsupported',
      );
    }
    const key = propertyKey(property.name, id);
    if (result.has(key)) fail(id, 'Duplicate normalized key', key);
    if (key === '__proto__') fail(id, 'Object-literal __proto__ semantics are unsupported', key);
    result.set(key, property.initializer);
  }
  return result;
}

function literalString(node, id, key) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isParenthesizedExpression(node)) return literalString(node.expression, id, key);
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    return literalString(node.left, id, key) + literalString(node.right, id, key);
  }
  fail(id, 'Expected a string literal or static string concatenation', key);
}

/** Parse the authoring table without executing TypeScript or accepting dynamic values. */
export function parseEnglishStrings(code, id = 'strings.ts') {
  const ast = parse(code, id);
  const declarations = [];
  walk(ast, (node) => {
    if (
      (ts.isVariableDeclaration(node) ||
        ts.isBindingElement(node) ||
        ts.isParameter(node) ||
        ts.isImportClause(node) ||
        ts.isImportSpecifier(node) ||
        ts.isNamespaceImport(node) ||
        ts.isFunctionDeclaration(node) ||
        ts.isClassDeclaration(node)) &&
      node.name &&
      ts.isIdentifier(node.name) &&
      node.name.text === 'EDITOR_STRINGS'
    ) {
      declarations.push(node);
    }
  });
  if (declarations.length !== 1 || !ts.isVariableDeclaration(declarations[0])) {
    fail(id, `Expected exactly one EDITOR_STRINGS table declaration; found ${declarations.length}`);
  }
  const declaration = declarations[0];
  const statement = declaration.parent.parent;
  if (
    !ts.isVariableStatement(statement) ||
    statement.parent !== ast ||
    !(declaration.parent.flags & ts.NodeFlags.Const) ||
    !statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
  ) {
    fail(id, 'EDITOR_STRINGS must be a top-level exported const');
  }
  const entries = new Map(
    [...properties(declaration.initializer, id)].map(([key, value]) => [
      key,
      literalString(value, id, key),
    ]),
  );
  return { keys: [...entries.keys()].sort(), entries, ast, object: declaration.initializer };
}

/** Validate raw JSON before JSON.parse can collapse duplicate or escaped duplicate keys. */
export function parseEditorTranslation(code, keys, id = 'translation.json') {
  const ast = parse(code, id, ts.ScriptKind.JSON);
  if (
    ast.statements.length !== 1 ||
    !ts.isExpressionStatement(ast.statements[0]) ||
    !ts.isObjectLiteralExpression(ast.statements[0].expression)
  ) {
    fail(id, 'Editor translation must have an object root');
  }
  const known = new Set(keys);
  const seen = new Set();
  for (const property of ast.statements[0].expression.properties) {
    if (!ts.isPropertyAssignment(property) || !ts.isStringLiteral(property.name)) {
      fail(id, 'Expected JSON string keys and string values');
    }
    const key = property.name.text;
    if (seen.has(key)) fail(id, 'Duplicate normalized JSON key', key);
    seen.add(key);
    if (!known.has(key)) fail(id, 'Unknown editor translation key', key);
    if (!ts.isStringLiteral(property.initializer)) fail(id, 'Expected a string value', key);
  }
  let data;
  try {
    data = JSON.parse(code);
  } catch (error) {
    fail(id, `Invalid JSON: ${error.message}`);
  }
  return keys.map((key) => (Object.hasOwn(data, key) ? data[key] : null));
}

/** Generate one ordinary-map decoder shared by English and every translated vector. */
export function editorDecoderSource(keys) {
  return `const keys=${JSON.stringify(keys)};export default values=>Object.fromEntries(keys.map((key,i)=>[key,values[i]]).filter(([,value])=>value!==null));`;
}

/** Compact emitted payloads only; the on-disk English and JSON remain authoring sources. */
export function compactEditorStrings(root = process.cwd()) {
  const absoluteRoot = path.resolve(root);
  const stringsPath = path.join(absoluteRoot, 'src/rendering/editor/strings.ts');
  const translationsPath = path.join(absoluteRoot, 'src/rendering/editor/translations');
  let english;
  const isJson = (id) => path.dirname(id) === translationsPath && id.endsWith('.json');
  const generated = (id) => id === stringsPath || id === DECODER_ID || isJson(id);
  return {
    name: 'compact-editor-strings',
    buildStart() {
      // A fresh build snapshot, not configuration-time state: watch can change the key vector.
      english = parseEnglishStrings(readFileSync(stringsPath, 'utf8'), stringsPath);
      this.addWatchFile(stringsPath);
    },
    shouldTransformCachedModule({ id }) {
      // Unchanged JSON source still needs a new vector when English keys change.
      return generated(id) ? true : null;
    },
    resolveId(id) {
      return id === DECODER_ID ? id : null;
    },
    load(id) {
      if (id !== DECODER_ID) return null;
      this.addWatchFile(stringsPath);
      return editorDecoderSource(english.keys);
    },
    transform(code, id) {
      if (!generated(id) || id === DECODER_ID) return null;
      this.addWatchFile(stringsPath);
      let binding = '__compactEditorDecode';
      while (code.includes(binding)) binding += '_';
      const prefix = `import ${binding} from ${JSON.stringify(DECODER_ID)};\n`;
      if (id === stringsPath) {
        const current = parseEnglishStrings(code, id);
        if (JSON.stringify(current.keys) !== JSON.stringify(english.keys)) {
          fail(id, 'English keys changed during this build; rebuild to take a consistent snapshot');
        }
        const values = current.keys.map((key) => current.entries.get(key));
        return {
          code:
            prefix +
            code.slice(0, current.object.getStart(current.ast)) +
            `${binding}(${JSON.stringify(values)})` +
            code.slice(current.object.end),
          map: null,
        };
      }
      return {
        code: `${prefix}export default ${binding}(${JSON.stringify(parseEditorTranslation(code, english.keys, id))});`,
        map: null,
      };
    },
  };
}

function symbolsFor(ast) {
  const options = { noLib: true, noResolve: true, allowJs: true };
  const host = ts.createCompilerHost(options);
  host.getSourceFile = (id) => (id === ast.fileName ? ast : undefined);
  const program = ts.createProgram([ast.fileName], options, host);
  const checker = program.getTypeChecker();
  return (node) => {
    if (ts.isShorthandPropertyAssignment(node.parent)) {
      return checker.getShorthandAssignmentValueSymbol(node.parent);
    }
    if (ts.isExportSpecifier(node.parent)) {
      return checker.getExportSpecifierLocalTargetSymbol(node.parent);
    }
    return checker.getSymbolAtLocation(node);
  };
}

function unwrap(node) {
  while (ts.isParenthesizedExpression(node)) node = node.expression;
  return node;
}

function reference(node) {
  const parent = node.parent;
  return !(
    (ts.isPropertyAccessExpression(parent) && parent.name === node) ||
    (ts.isPropertyAssignment(parent) && parent.name === node && !ts.isComputedPropertyName(node)) ||
    ((ts.isVariableDeclaration(parent) ||
      ts.isParameter(parent) ||
      ts.isFunctionDeclaration(parent) ||
      ts.isImportClause(parent)) &&
      parent.name === node)
  );
}

/** Fail closed on any source use outside the current, relative-time-only Day.js surface. */
export function validateDayjsUsage(code, id = 'source.ts') {
  const ast = parse(code, id);
  const symbol = symbolsFor(ast);
  const factories = new Set();
  const plugins = new Set();
  const instances = new Set();
  const calls = [];
  const dependencies = [];
  walk(ast, (node) => {
    if (ts.isStringLiteralLike(node) && /^dayjs(?:\/|$)/.test(node.text)) {
      const declaration = node.parent;
      if (!ts.isImportDeclaration(declaration) || declaration.moduleSpecifier !== node) {
        fail(
          id,
          'Day.js must use a direct static import; aliases, re-exports, and dynamic loads are unsupported',
        );
      }
      const clause = declaration.importClause;
      if (/^dayjs\/locale\/[a-z]+(?:-[a-z]+)?(?:\.js)?$/.test(node.text) && !clause) {
        dependencies.push(node.text.replace(/\.js$/, ''));
      } else if (
        (node.text === 'dayjs' || node.text === 'dayjs/plugin/relativeTime') &&
        clause?.name &&
        !clause.namedBindings &&
        !clause.isTypeOnly
      ) {
        (node.text === 'dayjs' ? factories : plugins).add(symbol(clause.name));
        dependencies.push(node.text);
      } else {
        fail(
          id,
          `Unsupported Day.js import ${JSON.stringify(node.text)}; revisit locale compaction`,
        );
      }
    }
    if (ts.isPropertyAccessExpression(node) && node.name.text === 'dayjs') {
      fail(id, 'Global or indirect Day.js access is unsupported');
    }
    if (ts.isCallExpression(node)) {
      calls.push(node);
      if (
        node.expression.kind === ts.SyntaxKind.ImportKeyword &&
        !ts.isStringLiteralLike(node.arguments[0]) &&
        !(
          path.basename(id) === 'calendar-card-pro.ts' &&
          node.arguments.length === 1 &&
          ts.isCallExpression(node.arguments[0]) &&
          node.arguments[0].expression.getText(ast) === 'editorModuleUrl' &&
          node.arguments[0].arguments.length === 1 &&
          node.arguments[0].arguments[0].getText(ast) === 'import.meta.url'
        )
      ) {
        fail(id, 'Unrecognized dynamic import could bypass the Day.js source guard');
      }
      if (ts.isIdentifier(node.expression) && node.expression.text === 'require') {
        fail(id, 'CommonJS loads can bypass the Day.js source guard; use static imports');
      }
    }
  });

  function instance(node) {
    node = unwrap(node);
    if (ts.isIdentifier(node)) return instances.has(symbol(node));
    if (!ts.isCallExpression(node)) return false;
    const callee = unwrap(node.expression);
    if (ts.isIdentifier(callee) && factories.has(symbol(callee))) return true;
    return (
      ts.isPropertyAccessExpression(callee) &&
      callee.name.text === 'locale' &&
      instance(callee.expression)
    );
  }

  // Bind by symbol, not spelling: a shadowed identifier cannot hide an escaping instance.
  let added;
  do {
    added = false;
    walk(ast, (node) => {
      if (ts.isVariableDeclaration(node) && node.initializer && instance(node.initializer)) {
        if (!ts.isIdentifier(node.name) || !(node.parent.flags & ts.NodeFlags.Const)) {
          fail(
            id,
            'Day.js instances require a local const identifier, not destructuring or mutation',
          );
        }
        const owner = node.parent.parent;
        if (
          !ts.isVariableStatement(owner) ||
          owner.parent === ast ||
          owner.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
        ) {
          fail(id, 'Day.js instances must not escape their function');
        }
        const value = symbol(node.name);
        if (!instances.has(value)) {
          instances.add(value);
          added = true;
        }
      }
    });
  } while (added);

  for (const call of calls) {
    const callee = unwrap(call.expression);
    if (ts.isIdentifier(callee) && factories.has(symbol(callee))) {
      if (
        call.questionDotToken ||
        call.arguments.length !== 1 ||
        ts.isSpreadElement(call.arguments[0])
      ) {
        fail(id, 'Only dayjs(date) is supported');
      }
    }
    if (ts.isPropertyAccessExpression(callee)) {
      if (ts.isIdentifier(callee.expression) && factories.has(symbol(callee.expression))) {
        if (
          callee.name.text !== 'extend' ||
          call.arguments.length !== 1 ||
          !ts.isIdentifier(call.arguments[0]) ||
          !plugins.has(symbol(call.arguments[0]))
        ) {
          fail(id, `Unsupported Day.js core API ${callee.name.text}; revisit locale compaction`);
        }
      } else if (instance(callee.expression)) {
        const method = callee.name.text;
        if (
          call.questionDotToken ||
          callee.questionDotToken ||
          !['locale', 'from', 'fromNow'].includes(method) ||
          call.arguments.some(ts.isSpreadElement) ||
          (method === 'fromNow' ? call.arguments.length !== 0 : call.arguments.length !== 1) ||
          (method === 'from' && !instance(call.arguments[0])) ||
          (method === 'locale' &&
            !ts.isIdentifier(call.arguments[0]) &&
            !ts.isStringLiteralLike(call.arguments[0]))
        ) {
          fail(id, `Unsupported Day.js instance API ${method}; revisit locale compaction`);
        }
      }
    }
    if (instance(call)) {
      let outer = call;
      while (ts.isParenthesizedExpression(outer.parent)) outer = outer.parent;
      const parent = outer.parent;
      if (!(
        (ts.isVariableDeclaration(parent) && parent.initializer === outer) ||
        (ts.isPropertyAccessExpression(parent) && parent.expression === outer) ||
        (ts.isCallExpression(parent) &&
          ts.isPropertyAccessExpression(parent.expression) &&
          parent.expression.name.text === 'from' &&
          instance(parent.expression.expression) &&
          parent.arguments[0] === outer)
      )) {
        fail(id, 'Day.js instance escapes the guarded relative-time call surface');
      }
    }
  }
  walk(ast, (node) => {
    if (
      (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) &&
      instance(node.expression) &&
      (!ts.isPropertyAccessExpression(node) ||
        !['locale', 'from', 'fromNow'].includes(node.name.text) ||
        !ts.isCallExpression(node.parent) ||
        node.parent.expression !== node)
    ) {
      fail(id, 'Day.js instance member must be a direct relative-time method call');
    }
    if (!ts.isIdentifier(node) || !reference(node)) return;
    const value = symbol(node);
    const parent = node.parent;
    if (factories.has(value)) {
      if (!(
        (ts.isCallExpression(parent) && parent.expression === node) ||
        (ts.isPropertyAccessExpression(parent) &&
          parent.expression === node &&
          parent.name.text === 'extend' &&
          ts.isCallExpression(parent.parent) &&
          parent.parent.expression === parent)
      )) {
        fail(id, 'Day.js factory alias, computed member, or escape is unsupported');
      }
    } else if (plugins.has(value)) {
      if (
        !ts.isCallExpression(parent) ||
        !ts.isPropertyAccessExpression(parent.expression) ||
        parent.expression.name.text !== 'extend' ||
        !factories.has(symbol(parent.expression.expression)) ||
        parent.arguments[0] !== node
      ) {
        fail(id, 'relativeTime plugin must only be passed directly to dayjs.extend');
      }
    } else if (instances.has(value)) {
      if (
        !ts.isPropertyAccessExpression(parent) ||
        parent.expression !== node ||
        !ts.isCallExpression(parent.parent) ||
        parent.parent.expression !== parent
      ) {
        fail(id, 'Day.js instance alias, computed member, or escape is unsupported');
      }
    }
  });
  return dependencies;
}

function pureInitializer(node, symbol, seen = new Set()) {
  node = unwrap(node);
  if (
    ts.isStringLiteralLike(node) ||
    ts.isNumericLiteral(node) ||
    ts.isRegularExpressionLiteral(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    [ts.SyntaxKind.TrueKeyword, ts.SyntaxKind.FalseKeyword, ts.SyntaxKind.NullKeyword].includes(
      node.kind,
    )
  ) {
    return true;
  }
  if (ts.isIdentifier(node)) {
    const declaration = symbol(node)?.valueDeclaration;
    if (!declaration || seen.has(declaration)) return false;
    if (ts.isFunctionDeclaration(declaration)) return true;
    if (!ts.isVariableDeclaration(declaration) || !declaration.initializer) return false;
    return pureInitializer(declaration.initializer, symbol, new Set([...seen, declaration]));
  }
  if (ts.isArrayLiteralExpression(node)) {
    return node.elements.every(
      (value) => !ts.isSpreadElement(value) && pureInitializer(value, symbol, seen),
    );
  }
  if (ts.isObjectLiteralExpression(node)) {
    return node.properties.every(
      (property) =>
        ts.isPropertyAssignment(property) &&
        !ts.isComputedPropertyName(property.name) &&
        propertyKey(property.name, 'locale initializer') !== '__proto__' &&
        pureInitializer(property.initializer, symbol, seen),
    );
  }
  if (
    ts.isPrefixUnaryExpression(node) &&
    [ts.SyntaxKind.MinusToken, ts.SyntaxKind.PlusToken, ts.SyntaxKind.ExclamationToken].includes(
      node.operator,
    )
  ) {
    return pureInitializer(node.operand, symbol, seen);
  }
  // The shipped corpus uses literal.split("_"); arbitrary calls can have observable effects.
  return (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    ts.isStringLiteralLike(node.expression.expression) &&
    node.expression.name.text === 'split' &&
    node.arguments.length === 1 &&
    ts.isStringLiteralLike(node.arguments[0])
  );
}

function relativeValue(node, symbol, seen = new Set()) {
  node = unwrap(node);
  if (ts.isStringLiteralLike(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node))
    return true;
  if (!ts.isIdentifier(node)) return false;
  const declaration = symbol(node)?.valueDeclaration;
  if (!declaration || seen.has(declaration)) return false;
  return (
    ts.isFunctionDeclaration(declaration) ||
    (ts.isVariableDeclaration(declaration) &&
      declaration.initializer &&
      relativeValue(declaration.initializer, symbol, new Set([...seen, declaration])))
  );
}

/** Remove unused locale metadata, retaining complete relative-time grammar and its helpers. */
export function trimDayjsLocaleFields(code, id) {
  const ast = parse(code, id, ts.ScriptKind.JS);
  const symbol = symbolsFor(ast);
  const candidates = [];
  walk(ast, (node) => {
    if (
      ts.isObjectLiteralExpression(node) &&
      node.properties.some((property) => property.name && propertyKey(property.name, id) === 'name')
    ) {
      candidates.push(node);
    }
  });
  if (candidates.length !== 1)
    fail(id, `Expected exactly one locale object; found ${candidates.length}`);
  const object = candidates[0];
  const fields = properties(object, id);
  const name = fields.get('name');
  const locale = path.basename(id, '.js');
  if (!name || !ts.isStringLiteral(name) || name.text !== locale) {
    fail(id, `Locale name must match filename ${JSON.stringify(locale)}`, 'name');
  }
  const relative = fields.get('relativeTime');
  if (!relative) {
    if (locale === 'en' && ts.isReturnStatement(object.parent)) return code;
    fail(id, 'Missing relativeTime object; dependency format changed', 'relativeTime');
  }
  const grammar = properties(relative, id);
  for (const key of RELATIVE_KEYS) {
    if (!grammar.has(key) || !relativeValue(grammar.get(key), symbol)) {
      fail(id, 'Missing or unsupported relative-time string/function', `relativeTime.${key}`);
    }
  }
  for (const [key, value] of grammar) {
    if (!relativeValue(value, symbol))
      fail(id, 'Unsupported relative-time value', `relativeTime.${key}`);
  }
  const declaration = object.parent;
  if (
    !ts.isVariableDeclaration(declaration) ||
    declaration.initializer !== object ||
    !ts.isIdentifier(declaration.name)
  ) {
    fail(
      id,
      'Locale object must directly initialize one local variable; composition is unsupported',
    );
  }
  const localeSymbol = symbol(declaration.name);
  let registrations = 0;
  walk(ast, (node) => {
    if (
      !ts.isIdentifier(node) ||
      symbol(node) !== localeSymbol ||
      node === declaration.name ||
      !reference(node)
    )
      return;
    const parent = node.parent;
    if (
      ts.isCallExpression(parent) &&
      ts.isPropertyAccessExpression(parent.expression) &&
      parent.expression.name.text === 'locale' &&
      parent.arguments.length === 3 &&
      parent.arguments[0] === node &&
      parent.arguments[1].kind === ts.SyntaxKind.NullKeyword &&
      parent.arguments[2].getText(ast) === '!0'
    ) {
      registrations++;
      return;
    }
    let returned = node;
    while (
      ts.isBinaryExpression(returned.parent) &&
      returned.parent.operatorToken.kind === ts.SyntaxKind.CommaToken &&
      returned.parent.right === returned
    ) {
      returned = returned.parent;
    }
    if (ts.isReturnStatement(returned.parent) && returned.parent.expression === returned) return;
    fail(id, 'Locale binding has an unsupported use; removed metadata may still be reachable');
  });
  if (registrations !== 1) fail(id, `Expected one locale registration; found ${registrations}`);
  for (const [key, value] of fields) {
    if (key !== 'name' && key !== 'relativeTime' && !pureInitializer(value, symbol)) {
      fail(id, 'Removed initializer may have side effects; refusing to trim', key);
    }
  }
  const kept = object.properties.filter((property) =>
    ['name', 'relativeTime'].includes(propertyKey(property.name, id)),
  );
  return (
    code.slice(0, object.getStart(ast)) +
    `{${kept.map((property) => property.getText(ast)).join(',')}}` +
    code.slice(object.end)
  );
}

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory()
      ? sourceFiles(file)
      : /\.[cm]?[jt]sx?$/.test(entry.name)
        ? [file]
        : [];
  });
}

/** Trim only Day.js locale payloads after validating every source file and imported locale. */
export function compactDayjsLocales(root = process.cwd()) {
  const sourcePath = path.join(path.resolve(root), 'src');
  let expected;
  const localeId = (id) =>
    /[/\\]node_modules[/\\]dayjs[/\\](?:esm[/\\])?locale[/\\]([^/\\]+)\.js$/.exec(id);
  return {
    name: 'compact-dayjs-locales',
    buildStart() {
      expected = new Set();
      this.addWatchFile(sourcePath);
      for (const file of sourceFiles(sourcePath)) {
        this.addWatchFile(file);
        for (const dependency of validateDayjsUsage(readFileSync(file, 'utf8'), file)) {
          if (dependency.startsWith('dayjs/locale/')) {
            const payload = createRequire(file).resolve(dependency);
            if (!localeId(payload)) fail(file, `Unrecognized Day.js locale layout: ${payload}`);
            this.addWatchFile(payload);
            trimDayjsLocaleFields(readFileSync(payload, 'utf8'), payload);
            expected.add(path.basename(payload, '.js'));
          }
        }
      }
    },
    shouldTransformCachedModule({ id }) {
      return localeId(id) ? true : null;
    },
    transform(code, id) {
      const match = localeId(id);
      if (!match) return null;
      if (!expected.has(match[1])) fail(id, 'Locale bypassed the validated source imports');
      return { code: trimDayjsLocaleFields(code, id), map: null };
    },
  };
}
