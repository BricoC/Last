import { describe, it, expect, afterEach } from "vitest";
import {
  sanitizeDescriptionRichHtml,
  extractPlainTextFromRichHtml,
  getEffectiveDescriptionRichHtml,
} from "../descriptionRichText";

type FakeNode = {
  nodeType: number;
  textContent: string;
  tagName?: string;
  childNodes: FakeNode[];
  getAttribute: (name: string) => string | null;
  style?: { fontWeight?: string; fontStyle?: string };
};

const origDOMParser = globalThis.DOMParser;
const origDocument = globalThis.document;
const origNode = globalThis.Node;

function makeTextNode(text: string): FakeNode {
  return {
    nodeType: 3,
    textContent: text,
    childNodes: [],
    getAttribute: () => null,
  };
}

function makeElementNode(
  tagName: string,
  attrs: Record<string, string> = {},
  children: FakeNode[] = [],
  style?: { fontWeight?: string; fontStyle?: string }
): FakeNode {
  return {
    nodeType: 1,
    tagName,
    textContent: children.map((c) => c.textContent).join(""),
    childNodes: children,
    getAttribute: (name: string) => attrs[name] ?? null,
    style,
  };
}

afterEach(() => {
  (globalThis as Record<string, unknown>).DOMParser = origDOMParser;
  (globalThis as Record<string, unknown>).document = origDocument;
  (globalThis as Record<string, unknown>).Node = origNode;
});

describe("descriptionRichText (XSS & sanitization)", () => {
  it("parses via DOMParser without ever assigning untrusted HTML to element.innerHTML", () => {
    let innerHtmlAssigned = false;
    (globalThis as Record<string, unknown>).Node = { TEXT_NODE: 3, ELEMENT_NODE: 1 };
    (globalThis as Record<string, unknown>).document = {
      createElement: () => ({
        set innerHTML(_v: string) {
          innerHtmlAssigned = true;
        },
      }),
    };
    (globalThis as Record<string, unknown>).DOMParser = class {
      parseFromString(_html: string, mimeType: string) {
        expect(mimeType).toBe("text/html");
        return {
          body: makeElementNode("body", {}, [
            makeElementNode("img", { src: "x", onerror: "window.__xss=1" }),
            makeElementNode("script", {}, [makeTextNode("alert(1)")]),
            makeElementNode("b", {}, [makeTextNode("Vite 4x40")]),
          ]),
        };
      }
    };

    const raw = '<img src=x onerror="window.__xss=1"><script>alert(1)</script><b>Vite 4x40</b>';
    const sanitized = sanitizeDescriptionRichHtml(raw);
    const plain = extractPlainTextFromRichHtml(raw);
    const effective = getEffectiveDescriptionRichHtml("Vite 4x40", raw);

    expect(innerHtmlAssigned).toBe(false);
    expect(sanitized).toBe("<b>Vite 4x40</b>");
    expect(plain).toBe("Vite 4x40");
    expect(effective).toBe("<b>Vite 4x40</b>");
  });

  it("preserves allowed formatting tokens and escapes text nodes", () => {
    (globalThis as Record<string, unknown>).Node = { TEXT_NODE: 3, ELEMENT_NODE: 1 };
    (globalThis as Record<string, unknown>).DOMParser = class {
      parseFromString() {
        return {
          body: makeElementNode("body", {}, [
            makeElementNode("span", { "data-pl-color": "red" }, [makeTextNode("Promo <2026>")]),
            makeTextNode(" "),
            makeElementNode("mark", { "data-pl-hl": "yellow" }, [makeTextNode("Top")]),
          ]),
        };
      }
    };

    const result = sanitizeDescriptionRichHtml('<span data-pl-color="red">Promo &lt;2026&gt;</span> <mark data-pl-hl="yellow">Top</mark>');
    expect(result).toBe('<span data-pl-color="red">Promo &lt;2026&gt;</span> <mark data-pl-hl="yellow">Top</mark>');
  });
});
