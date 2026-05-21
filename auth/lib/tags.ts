export function css(
  strings: TemplateStringsArray,
  ...values: (string | number | boolean)[]
) {
  let result = "";
  for (let i = 0; i < strings.length; i++) {
    result += strings[i];
    if (i < values.length) {
      result += values[i];
    }
  }
  return result;
}
