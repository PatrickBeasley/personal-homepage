/**
 * Server-side HTML allowlist for note bodies.
 *
 * Note content is authored in a `contenteditable`, which means the browser —
 * and anything the user pastes into it — decides what markup arrives. That is
 * hostile input: it may be unbalanced, may contain comments, `<SCRIPT>` in any
 * casing, event-handler attributes, or a `>` inside a quoted attribute value.
 * A regex that assumes well-formed markup would be defeated by all of those, so
 * this module tokenizes the input with a small state machine instead and
 * *re-serializes* only what it recognises. Anything it does not understand
 * cannot survive, because nothing is ever copied through verbatim.
 *
 * The rules:
 *   - Only the tags in `ALLOWED_TAGS` are emitted, and always with **zero**
 *     attributes — no `style`, `class`, `href`, `src`, and no `on*` handlers.
 *   - Any other tag is dropped but its text content is kept, so pasting from a
 *     word processor loses the chrome and keeps the words.
 *   - `<script>` and `<style>` are the exception: their *contents* are
 *     discarded too, since that text is code, not prose.
 *   - Output is always balanced: unclosed tags are closed at the end, and stray
 *     end tags are ignored.
 *
 * This runs on the server, before the row is written. The client never gets to
 * be the only sanitizer.
 */

/** Tags that survive, per the Phase 5 brief. */
const ALLOWED_TAGS = new Set(["b", "strong", "i", "em", "ul", "li", "h3", "p", "br", "div"]);

/** Allowed tags that never have children and are never pushed onto the stack. */
const VOID_TAGS = new Set(["br"]);

/** Tags whose text content is code and must be thrown away with the tag. */
const RAW_TEXT_TAGS = new Set(["script", "style"]);

/**
 * Caps on what a single note may store. These are checked against the *raw*
 * request values before sanitizing, so a paste bomb is rejected rather than
 * parsed, and cannot be used to fill the table.
 */
export const NOTE_TITLE_MAX_LENGTH = 200;
export const NOTE_CONTENT_MAX_LENGTH = 100_000;

/**
 * A character reference that is already well-formed. Sticky, so it can be
 * tested at an exact offset without slicing the string.
 *
 * Ampersands that begin one of these are passed through untouched; every other
 * ampersand becomes `&amp;`. Escaping *all* of them would make sanitizing
 * non-idempotent — each autosave round trip would turn `&amp;` into
 * `&amp;amp;` and the note would rot one save at a time.
 */
const ENTITY_PATTERN = /&(?:#\d{1,7};|#[xX][0-9a-fA-F]{1,6};|[a-zA-Z][a-zA-Z0-9]{1,31};)/y;

const WHITESPACE_PATTERN = /\s/;
const TAG_NAME_PATTERN = /[a-zA-Z0-9]/;

function isAsciiLetter(ch: string): boolean {
  return (ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z");
}

/**
 * Escapes a run of text for re-insertion into HTML. `<` and `>` always become
 * entities; `&` only when it does not already start a character reference.
 */
function escapeText(value: string): string {
  return value.replace(/[<>&]/g, (ch, offset: number) => {
    if (ch === "<") {
      return "&lt;";
    }

    if (ch === ">") {
      return "&gt;";
    }

    ENTITY_PATTERN.lastIndex = offset;

    return ENTITY_PATTERN.test(value) ? "&" : "&amp;";
  });
}

type TagScanState =
  | "beforeAttr"
  | "attrName"
  | "afterAttrName"
  | "beforeValue"
  | "quotedValue"
  | "unquotedValue";

/**
 * Finds where a tag ends, starting just past its name, and returns the index
 * one past the closing `>` (or the end of the string for a truncated tag).
 *
 * This is the piece a naive `/<[^>]*>/` gets wrong: inside a quoted attribute
 * value a `>` is an ordinary character, so `<div title="a>b">` is one tag, not
 * a tag plus the text `b">`. The state machine below tracks quoting the way an
 * HTML tokenizer does, so the attribute-smuggling trick has nothing to smuggle.
 */
function scanTagEnd(html: string, from: number): number {
  let state: TagScanState = "beforeAttr";
  let quote = "";
  let i = from;

  while (i < html.length) {
    const ch = html[i];

    switch (state) {
      case "beforeAttr":
        if (ch === ">") {
          return i + 1;
        }

        if (WHITESPACE_PATTERN.test(ch) || ch === "/") {
          i += 1;
          break;
        }

        state = "attrName";
        break;

      case "attrName":
        if (ch === ">") {
          return i + 1;
        }

        if (ch === "=") {
          state = "beforeValue";
          i += 1;
          break;
        }

        if (WHITESPACE_PATTERN.test(ch)) {
          state = "afterAttrName";
          i += 1;
          break;
        }

        i += 1;
        break;

      case "afterAttrName":
        if (ch === ">") {
          return i + 1;
        }

        if (WHITESPACE_PATTERN.test(ch)) {
          i += 1;
          break;
        }

        if (ch === "=") {
          state = "beforeValue";
          i += 1;
          break;
        }

        state = "attrName";
        break;

      case "beforeValue":
        if (ch === ">") {
          return i + 1;
        }

        if (WHITESPACE_PATTERN.test(ch)) {
          i += 1;
          break;
        }

        if (ch === '"' || ch === "'") {
          quote = ch;
          state = "quotedValue";
          i += 1;
          break;
        }

        state = "unquotedValue";
        break;

      case "quotedValue":
        if (ch === quote) {
          state = "beforeAttr";
        }

        i += 1;
        break;

      case "unquotedValue":
        if (ch === ">") {
          return i + 1;
        }

        if (WHITESPACE_PATTERN.test(ch)) {
          state = "beforeAttr";
          i += 1;
          break;
        }

        i += 1;
        break;
    }
  }

  // Unterminated tag: everything from `<` onwards is consumed and dropped,
  // which is the safe direction — a truncated `<script` swallows the rest.
  return html.length;
}

/**
 * Skips the raw-text content of a `<script>`/`<style>` element and its closing
 * tag. Inside these elements `<` is not markup, so the only thing that ends
 * them is a matching end tag — matched case-insensitively via `lowerHtml`.
 */
function skipRawText(html: string, lowerHtml: string, from: number, name: string): number {
  const closing = `</${name}`;
  let search = from;

  for (;;) {
    const index = lowerHtml.indexOf(closing, search);

    if (index === -1) {
      return html.length;
    }

    const after = html[index + closing.length];

    // `</scriptx>` does not close a script element; `</script >` does.
    if (after === undefined || after === ">" || after === "/" || WHITESPACE_PATTERN.test(after)) {
      return scanTagEnd(html, index + closing.length);
    }

    search = index + closing.length;
  }
}

/**
 * Returns a safe, balanced subset of `input` containing only allowed tags with
 * every attribute removed.
 */
export function sanitizeNoteHtml(input: string): string {
  if (typeof input !== "string" || input === "") {
    return "";
  }

  const html = input;
  const lowerHtml = html.toLowerCase();
  const out: string[] = [];
  /** Allowed, still-open elements, innermost last. */
  const open: string[] = [];
  let pendingText = "";
  let i = 0;

  function flushText() {
    if (pendingText) {
      out.push(escapeText(pendingText));
      pendingText = "";
    }
  }

  while (i < html.length) {
    if (html[i] !== "<") {
      pendingText += html[i];
      i += 1;
      continue;
    }

    if (html.startsWith("<!--", i)) {
      const end = html.indexOf("-->", i + 4);
      i = end === -1 ? html.length : end + 3;
      continue;
    }

    // Doctypes, CDATA and processing instructions carry no content we want.
    if (html.startsWith("<!", i) || html.startsWith("<?", i)) {
      const end = html.indexOf(">", i + 2);
      i = end === -1 ? html.length : end + 1;
      continue;
    }

    const isEndTag = html[i + 1] === "/";
    const nameStart = isEndTag ? i + 2 : i + 1;

    if (!isAsciiLetter(html[nameStart] ?? "")) {
      // A `<` that does not begin a tag is literal text, as in a browser. It is
      // escaped on the way out, so it cannot become a tag later.
      pendingText += html[i];
      i += 1;
      continue;
    }

    let nameEnd = nameStart;

    while (nameEnd < html.length && TAG_NAME_PATTERN.test(html[nameEnd])) {
      nameEnd += 1;
    }

    const name = html.slice(nameStart, nameEnd).toLowerCase();
    const tagEnd = scanTagEnd(html, nameEnd);

    if (RAW_TEXT_TAGS.has(name)) {
      // A stray `</script>` with no opener is simply dropped.
      i = isEndTag ? tagEnd : skipRawText(html, lowerHtml, tagEnd, name);
      continue;
    }

    if (!ALLOWED_TAGS.has(name)) {
      // Drop the tag, keep whatever it wrapped.
      i = tagEnd;
      continue;
    }

    flushText();

    if (isEndTag) {
      const index = open.lastIndexOf(name);

      // Close everything opened inside the element too, so `<p><b>x</p>` still
      // produces balanced output. An end tag with no opener is ignored.
      if (index !== -1) {
        for (let k = open.length - 1; k >= index; k -= 1) {
          out.push(`</${open[k]}>`);
        }

        open.length = index;
      }
    } else if (VOID_TAGS.has(name)) {
      out.push(`<${name}>`);
    } else {
      out.push(`<${name}>`);
      open.push(name);
    }

    i = tagEnd;
  }

  flushText();

  for (let k = open.length - 1; k >= 0; k -= 1) {
    out.push(`</${open[k]}>`);
  }

  return out.join("");
}

/**
 * The plain-text rendering of sanitized note HTML — used for list previews and
 * search. Shared with the client, which is why it lives here rather than in the
 * view: both sides must agree on what a note "says".
 *
 * The naive tag-stripping regex is acceptable *here* because this is a display
 * helper, never a security boundary: its result is rendered as React text,
 * which escapes it again. On stored (already sanitized) markup it is exact,
 * since no attribute — and therefore no quoted `>` — can exist. On the editor's
 * live, unsanitized markup it may occasionally mis-split a preview; that is a
 * cosmetic risk only.
 */
export function noteHtmlToText(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;/g, "'")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}
