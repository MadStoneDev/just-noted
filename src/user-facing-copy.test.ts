// Guards the house style for user-facing copy: no em-dashes, no spaced
// en-dashes. Parses every non-test source file in src/ with the TypeScript
// compiler and checks string literals, template literals and JSX text, so code
// comments are never scanned. console.* arguments are logs, not UI, so they're
// skipped. Unspaced en-dashes in ranges ("Title A–Z") are fine.
import { describe, it, expect } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import ts from "typescript";

const SRC = path.resolve(__dirname);

// Text that is allowed to be exactly one of these (after trimming): table and
// stat placeholders ("—" = no value) and the date-range separator in version
// history. Anything longer containing a dash is still flagged.
const ALLOWED_EXACT = new Set(["—", "–"]);

const BANNED: { name: string; re: RegExp }[] = [
  { name: "em-dash", re: /—|&mdash;|&#8212;|&#x2014;/i },
  { name: "spaced en-dash", re: /\s(–|&ndash;|&#8211;|&#x2013;)\s/i },
];

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return sourceFiles(p);
    if (!/\.tsx?$/.test(e.name) || /\.d\.ts$/.test(e.name)) return [];
    if (/\.(test|spec)\.tsx?$/.test(e.name) || /\.testutil\.ts$/.test(e.name)) return [];
    return [p];
  });
}

function isConsoleCall(node: ts.Node): boolean {
  return (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    ts.isIdentifier(node.expression.expression) &&
    node.expression.expression.text === "console"
  );
}

type Hit = { file: string; line: number; rule: string; text: string };

function scan(file: string): Hit[] {
  const code = fs.readFileSync(file, "utf8");
  const sf = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const hits: Hit[] = [];

  const check = (node: ts.Node, text: string) => {
    if (ALLOWED_EXACT.has(text.trim())) return;
    for (const { name, re } of BANNED) {
      if (re.test(text)) {
        const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
        hits.push({ file: path.relative(SRC, file), line: line + 1, rule: name, text: text.trim().slice(0, 100) });
      }
    }
  };

  const visit = (node: ts.Node): void => {
    if (isConsoleCall(node)) return;
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) check(node, node.text);
    else if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) check(node, node.text);
    else if (ts.isJsxText(node)) check(node, node.getText(sf));
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return hits;
}

describe("user-facing copy", () => {
  it("has no em-dashes or spaced en-dashes in strings or JSX text", () => {
    const hits = sourceFiles(SRC).flatMap(scan);
    const report = hits.map((h) => `src/${h.file}:${h.line} [${h.rule}] ${h.text}`).join("\n");
    expect(report, `Use a full stop, comma, colon or brackets instead:\n${report}`).toBe("");
  });

  it("catches the patterns it is meant to catch", () => {
    // Self-check so a broken scanner can't pass silently.
    const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "copy-probe-")), "probe.tsx");
    fs.writeFileSync(
      tmp,
      [
        'const a = "Saved — nice";',
        "const b = `x ${1} – y`;",
        "const c = <p>Hello &mdash; there</p>;",
        'const ok = ["—", "Title A–Z"];',
        'console.error("log — ignored");',
        "// comment — ignored",
      ].join("\n"),
    );
    try {
      const rules = scan(tmp).map((h) => `${h.line}:${h.rule}`);
      expect(rules).toEqual(["1:em-dash", "2:spaced en-dash", "3:em-dash"]);
    } finally {
      fs.unlinkSync(tmp);
    }
  });
});
