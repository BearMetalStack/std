export function stylizer(s: string | number, style: string) {
  return `\x1b${style}${s}\x1b[0m`;
}

export const colors = {
  reset: `0`,
  bold: `1`,
  dim: `2`,
  italic: `3`,
  underline: `4`,
  inverse: `7`,
  hidden: `8`,
  black: `30`,
  red: `31`,
  green: `32`,
  yellow: `33`,
  blue: `34`,
  magenta: `35`,
  cyan: `36`,
  white: `37`,
  bgBlack: `40`,
  bgRed: `41`,
  bgGreen: `42`,
  bgYellow: `43`,
  bgBlue: `44`,
  bgMagenta: `45`,
  bgCyan: `46`,
  bgWhite: `47`,
};

export const styles: Record<string, Record<string, string>> = {
  status: {
    "200": `[${colors.green};${colors.bold}m`,
    "400": `[${colors.yellow};${colors.bold}m`,
    "500": `[${colors.red};${colors.bold}m`,
    default: `[${colors.white};${colors.bold}m`,
  },
  method: {
    GET: `[${colors.black};${colors.bgGreen}m`,
    POST: `[${colors.black};${colors.bgBlue}m`,
    PUT: `[${colors.black};${colors.bgCyan}m`,
    PATCH: `[${colors.black};${colors.bgMagenta}m`,
    DELETE: `[${colors.black};${colors.bgRed}m`,
    OPTIONS: `[${colors.black};${colors.bgYellow}m`,
    _use: `[${colors.black};${colors.bgWhite}m`,
    default: `[${colors.black};${colors.bgWhite}m`,
  },
  path: {
    GET: `[${colors.blue};${colors.italic}m`,
    POST: `[${colors.blue};${colors.italic}m`,
    PUT: `[${colors.blue};${colors.italic}m`,
    PATCH: `[${colors.blue};${colors.italic}m`,
    DELETE: `[${colors.blue};${colors.italic}m`,
    OPTIONS: `[${colors.blue};${colors.italic}m`,
    _use: `[${colors.blue};${colors.italic}m`,
    default: `[${colors.blue};${colors.italic}m`,
  },
  param: {
    GET: `[${colors.cyan}m`,
    POST: `[${colors.cyan}m`,
    PUT: `[${colors.cyan}m`,
    PATCH: `[${colors.cyan}m`,
    DELETE: `[${colors.cyan}m`,
    OPTIONS: `[${colors.cyan}m`,
    _use: `[${colors.cyan}m`,
    default: `[${colors.cyan}m`,
  },
};

export function styleAlias(
  section: keyof typeof styles,
  style: string | number,
) {
  if (section === "status") {
    style = (Math.floor(Number(style) / 100) * 100).toString();
  }
  return styles[section][style] ?? styles[section]["default"];
}
