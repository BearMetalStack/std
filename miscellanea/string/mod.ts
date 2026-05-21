import { escapeHtml } from "./htmlEscape.ts";
export * from "./htmlEscape.ts";

export function css(
  strings: TemplateStringsArray,
  ...values: (string | number | boolean)[]
): string {
  let result = "";
  for (let i = 0; i < strings.length; i++) {
    result += strings[i];
    if (i < values.length) {
      result += values[i];
    }
  }
  return result;
}

export function html(
  strings: TemplateStringsArray,
  ...values: (string | number | boolean)[]
): string {
  let result = "";
  for (let i = 0; i < strings.length; i++) {
    result += strings[i];
    if (i < values.length) {
      result += typeof values[i] === "string"
        ? escapeHtml(values[i] as string)
        : String(values[i]);
    }
  }
  return result;
}
