enum Time {
  second,
  minute,
  millisecond,
  hour,
  day,
  week,
  year, // 365.2425 days
}

const TIME_KEYS = ["ms", "s", "m", "h", "d", "w", "y"] as const;
type TimeKey = typeof TIME_KEYS[number];
const TimeStack = [
  Time.week,
  Time.day,
  Time.hour,
  Time.minute,
  Time.second,
  Time.millisecond,
];

const TimeSignatures: Record<Time, number> = {
  [Time.millisecond]: 1,
  [Time.second]: 1000,
  [Time.minute]: 60,
  [Time.hour]: 60,
  [Time.day]: 24,
  [Time.week]: 7,
  [Time.year]: 365.2425,
};

const Aliases: Record<TimeKey, Time> = {
  ms: Time.millisecond,
  m: Time.minute,
  s: Time.second,
  h: Time.hour,
  d: Time.day,
  w: Time.week,
  y: Time.year,
};

export type TimeString = `${number}${TimeKey}`;

function parseTimeString(ts: TimeString) {
  const [_, time = "0", key = "ms"] = ts.match(/(\d+)(ms|s|m|h|d|w|y)/) ??
    [undefined, "0", "ms"];
  return [Number(time), Aliases[key as TimeKey]];
}

export function timeStringToMillis(ts: TimeString): number {
  const [time, key] = parseTimeString(ts);
  const stack = key === Time.year
    ? TimeStack.toSpliced(0, 1, Time.year)
    : TimeStack.slice(TimeStack.indexOf(key));

  return stack.reduce((a, b) => a * TimeSignatures[b], time);
}
