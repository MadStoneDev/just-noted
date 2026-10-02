import { describe, it, expect } from "vitest";
import {
  toUpperCase,
  toLowerCase,
  toSentenceCase,
  toTitleCase,
  toCapitalizeWords,
  toCamelCase,
  toPascalCase,
  toSnakeCase,
  toKebabCase,
  toConstantCase,
  trimText,
  removeExtraSpaces,
  removeLineBreaks,
  removeEmptyLines,
  removeDuplicateLines,
  sortLinesAZ,
  toStraightQuotes,
  toCurlyQuotes,
  stripHtml,
  stripMarkdown,
} from "./case";

describe("case transforms", () => {
  it("UPPER / lower", () => {
    expect(toUpperCase("Hello")).toBe("HELLO");
    expect(toLowerCase("Hello")).toBe("hello");
  });

  it("preserves emoji while changing case", () => {
    expect(toUpperCase("a😀b")).toBe("A😀B");
    expect(toLowerCase("A😀B")).toBe("a😀b");
  });

  it("Sentence case capitalises each sentence, line breaks, and standalone I", () => {
    expect(toSentenceCase("hello world. goodbye world")).toBe("Hello world. Goodbye world");
    expect(toSentenceCase("WHY SHOUT? be calm")).toBe("Why shout? Be calm");
    expect(toSentenceCase("first line\nsecond line")).toBe("First line\nSecond line");
    expect(toSentenceCase("today i went. i saw it")).toBe("Today I went. I saw it");
  });

  it("Title Case: small words lower except first/last or after a colon", () => {
    expect(toTitleCase("the lord of the rings")).toBe("The Lord of the Rings");
    expect(toTitleCase("a tale of two cities")).toBe("A Tale of Two Cities");
    expect(toTitleCase("what are you waiting for")).toBe("What Are You Waiting For");
    expect(toTitleCase("the title: a new hope")).toBe("The Title: A New Hope");
  });

  it("Capitalise Every Word (rest lowercased)", () => {
    expect(toCapitalizeWords("hELLO there wORLD")).toBe("Hello There World");
  });

  it("camel / Pascal / snake / kebab / CONSTANT", () => {
    expect(toCamelCase("Hello world foo")).toBe("helloWorldFoo");
    expect(toPascalCase("hello world foo")).toBe("HelloWorldFoo");
    expect(toSnakeCase("Hello World")).toBe("hello_world");
    expect(toKebabCase("Hello World")).toBe("hello-world");
    expect(toConstantCase("Hello World")).toBe("HELLO_WORLD");
  });

  it("developer cases split camelCase/punctuation and keep accents, per line", () => {
    expect(toSnakeCase("helloWorld-foo bar")).toBe("hello_world_foo_bar");
    expect(toKebabCase("XMLHttpRequest")).toBe("xml-http-request");
    expect(toSnakeCase("café crème")).toBe("café_crème");
    // per line
    expect(toSnakeCase("foo bar\nbaz qux")).toBe("foo_bar\nbaz_qux");
  });

  it("empty input stays empty", () => {
    expect(toTitleCase("")).toBe("");
    expect(toCamelCase("")).toBe("");
    expect(toSnakeCase("")).toBe("");
  });
});

describe("cleanup transforms", () => {
  it("trims per line and collapses extra spaces (keeping newlines)", () => {
    expect(trimText("  hi  ")).toBe("hi");
    expect(trimText("  a  \n  b  ")).toBe("a\nb");
    expect(removeExtraSpaces("a    b\tc")).toBe("a b c");
    expect(removeExtraSpaces("a   b\n  c  d")).toBe("a b\n c d");
  });

  it("removes line breaks / empty / duplicate lines (dedupe after trim)", () => {
    expect(removeLineBreaks("a\nb\nc")).toBe("a b c");
    expect(removeEmptyLines("a\n\n\nb\n  \nc")).toBe("a\nb\nc");
    expect(removeDuplicateLines("a\nb\na\nc\nb")).toBe("a\nb\nc");
    expect(removeDuplicateLines("hi\n hi \nbye")).toBe("hi\nbye");
  });

  it("sorts lines A–Z (case-insensitive)", () => {
    expect(sortLinesAZ("banana\nApple\ncherry")).toBe("Apple\nbanana\ncherry");
  });

  it("converts quotes both ways", () => {
    expect(toStraightQuotes("“hi” and ‘bye’")).toBe('"hi" and \'bye\'');
    expect(toCurlyQuotes('"hi"')).toBe("“hi”");
  });

  it("strips HTML and decodes entities", () => {
    expect(stripHtml("<p>Hello <b>world</b></p>")).toBe("Hello world");
    expect(stripHtml("a &amp; b &lt;c&gt;")).toBe("a & b <c>");
  });

  it("strips Markdown to plain text", () => {
    expect(stripMarkdown("# Heading")).toBe("Heading");
    expect(stripMarkdown("**bold** and *italic* and `code`")).toBe("bold and italic and code");
    expect(stripMarkdown("[JustNoted](https://justnoted.app)")).toBe("JustNoted");
    expect(stripMarkdown("- one\n- two")).toBe("one\ntwo");
  });
});
