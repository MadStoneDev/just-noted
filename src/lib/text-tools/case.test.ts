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

  it("Sentence case capitalises each sentence", () => {
    expect(toSentenceCase("hello world. goodbye world")).toBe("Hello world. Goodbye world");
    expect(toSentenceCase("WHY SHOUT? be calm")).toBe("Why shout? Be calm");
  });

  it("Title Case lowercases small words except first/last", () => {
    expect(toTitleCase("the lord of the rings")).toBe("The Lord of the Rings");
    expect(toTitleCase("a tale of two cities")).toBe("A Tale of Two Cities");
    // small word as the last word is still capitalised
    expect(toTitleCase("what are you waiting for")).toBe("What Are You Waiting For");
  });

  it("Capitalise Every Word", () => {
    expect(toCapitalizeWords("hello there world")).toBe("Hello There World");
  });

  it("camel / Pascal / snake / kebab / CONSTANT", () => {
    expect(toCamelCase("Hello world foo")).toBe("helloWorldFoo");
    expect(toPascalCase("hello world foo")).toBe("HelloWorldFoo");
    expect(toSnakeCase("Hello World")).toBe("hello_world");
    expect(toKebabCase("Hello World")).toBe("hello-world");
    expect(toConstantCase("Hello World")).toBe("HELLO_WORLD");
  });

  it("programmer cases split camelCase and punctuation", () => {
    expect(toSnakeCase("helloWorld-foo bar")).toBe("hello_world_foo_bar");
    expect(toKebabCase("XMLHttpRequest")).toBe("xml-http-request");
  });

  it("empty input stays empty", () => {
    expect(toTitleCase("")).toBe("");
    expect(toCamelCase("")).toBe("");
    expect(toSnakeCase("")).toBe("");
  });
});

describe("cleanup transforms", () => {
  it("trims and collapses extra spaces (keeping newlines)", () => {
    expect(trimText("  hi  ")).toBe("hi");
    expect(removeExtraSpaces("a    b\tc")).toBe("a b c");
    expect(removeExtraSpaces("a   b\n  c  d")).toBe("a b\n c d");
  });

  it("removes line breaks / empty / duplicate lines", () => {
    expect(removeLineBreaks("a\nb\nc")).toBe("a b c");
    expect(removeEmptyLines("a\n\n\nb\n  \nc")).toBe("a\nb\nc");
    expect(removeDuplicateLines("a\nb\na\nc\nb")).toBe("a\nb\nc");
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
