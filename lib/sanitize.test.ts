import { describe, expect, it } from "vitest";

import { noteHtmlToText, sanitizeNoteHtml } from "./sanitize";

describe("sanitizeNoteHtml", () => {
  it("drops a script element and its contents entirely", () => {
    expect(sanitizeNoteHtml("<script>alert(1)</script>")).toBe("");
    expect(sanitizeNoteHtml("before<script>alert(1)</script>after")).toBe("beforeafter");
  });

  it("drops script elements regardless of casing", () => {
    expect(sanitizeNoteHtml("<SCRIPT>alert(1)</SCRIPT>")).toBe("");
    expect(sanitizeNoteHtml("<ScRiPt >alert(1)</sCrIpT >")).toBe("");
    expect(sanitizeNoteHtml("<p>a</p><Script type=\"x\">alert(1)</script>")).toBe("<p>a</p>");
  });

  it("discards the contents of an unterminated script", () => {
    expect(sanitizeNoteHtml("ok<script>alert(1)")).toBe("ok");
  });

  it("does not let a fake closing tag re-open script content", () => {
    expect(sanitizeNoteHtml("<script></scriptx>alert(1)</script>tail")).toBe("tail");
  });

  it("drops style elements and their contents", () => {
    expect(sanitizeNoteHtml("<style>body{display:none}</style>text")).toBe("text");
  });

  it("drops an image with an inline event handler", () => {
    expect(sanitizeNoteHtml("<img src=x onerror=alert(1)>")).toBe("");
    expect(sanitizeNoteHtml("<p><img src=x onerror=alert(1)>hi</p>")).toBe("<p>hi</p>");
  });

  it("drops an anchor with a javascript: href but keeps its text", () => {
    expect(sanitizeNoteHtml('<a href="javascript:alert(1)">x</a>')).toBe("x");
  });

  it("strips every attribute from allowed tags", () => {
    expect(sanitizeNoteHtml('<div style="color:red">hi</div>')).toBe("<div>hi</div>");
    expect(
      sanitizeNoteHtml('<p class="x" onclick="alert(1)" data-y=\'z\'>text</p>')
    ).toBe("<p>text</p>");
    expect(sanitizeNoteHtml("<b onmouseover=alert(1)>bold</b>")).toBe("<b>bold</b>");
  });

  it("is not fooled by a > inside a quoted attribute value", () => {
    expect(sanitizeNoteHtml('<div title="a>b">c</div>')).toBe("<div>c</div>");
    expect(sanitizeNoteHtml("<img alt='x>y' onerror=alert(1)>z")).toBe("z");
  });

  it("removes comments without leaking their contents", () => {
    expect(sanitizeNoteHtml("<!-- comment -->")).toBe("");
    expect(sanitizeNoteHtml("a<!-- <script>alert(1)</script> -->b")).toBe("ab");
    expect(sanitizeNoteHtml("a<!-- unterminated")).toBe("a");
  });

  it("balances an unclosed tag", () => {
    expect(sanitizeNoteHtml("<b>unbalanced")).toBe("<b>unbalanced</b>");
    expect(sanitizeNoteHtml("<p><b>x</p>")).toBe("<p><b>x</b></p>");
  });

  it("ignores an end tag that was never opened", () => {
    expect(sanitizeNoteHtml("</b>text")).toBe("text");
  });

  it("keeps the text of a disallowed tag nested inside an allowed one", () => {
    expect(sanitizeNoteHtml('<p><span onclick="steal()">hi</span></p>')).toBe("<p>hi</p>");
    expect(sanitizeNoteHtml("<ul><li><table><tr><td>cell</td></tr></table></li></ul>")).toBe(
      "<ul><li>cell</li></ul>"
    );
  });

  it("preserves plain formatting exactly", () => {
    const formatted =
      "<h3>Heading</h3><p>Some <b>bold</b> and <i>italic</i> and <strong>strong</strong> " +
      "and <em>em</em>.</p><ul><li>one</li><li>two</li></ul><div>line<br>break</div>";

    expect(sanitizeNoteHtml(formatted)).toBe(formatted);
  });

  it("is idempotent, so autosave round trips do not rot the note", () => {
    const source = '<p>Tom &amp; Jerry &lt;3 <b>bold</b></p><script>alert(1)</script>';
    const once = sanitizeNoteHtml(source);

    expect(once).toBe("<p>Tom &amp; Jerry &lt;3 <b>bold</b></p>");
    expect(sanitizeNoteHtml(once)).toBe(once);
  });

  it("escapes a bare ampersand and a stray angle bracket", () => {
    expect(sanitizeNoteHtml("Tom & Jerry")).toBe("Tom &amp; Jerry");
    expect(sanitizeNoteHtml("5 < 6 > 4")).toBe("5 &lt; 6 &gt; 4");
    expect(sanitizeNoteHtml("a <3 b")).toBe("a &lt;3 b");
  });

  it("returns an empty string for empty or non-string input", () => {
    expect(sanitizeNoteHtml("")).toBe("");
    expect(sanitizeNoteHtml(undefined as unknown as string)).toBe("");
  });
});

describe("noteHtmlToText", () => {
  it("flattens sanitized markup to a single line of prose", () => {
    expect(noteHtmlToText("<h3>Title</h3><p>Body <b>text</b></p>")).toBe("Title Body text");
  });

  it("decodes the entities the sanitizer emits", () => {
    expect(noteHtmlToText("<p>Tom &amp; Jerry</p>")).toBe("Tom & Jerry");
  });

  it("is empty for an empty note", () => {
    expect(noteHtmlToText("<p><br></p>")).toBe("");
  });
});
