const raw = Symbol.for("hedystia.raw-html");
export type RawHTML = { readonly [raw]: true; readonly html: string; toString: () => string };

/** Mark already-rendered trusted HTML; never use this for untrusted user input. */
export function rawHTML(html: string): RawHTML {
  return { [raw]: true, html, toString: () => html };
}

/** Recognize an explicit trusted HTML value without treating ordinary strings as markup. */
export function isRawHTML(value: unknown): value is RawHTML {
  return (
    typeof value === "object" && value !== null && raw in value && (value as RawHTML)[raw] === true
  );
}
