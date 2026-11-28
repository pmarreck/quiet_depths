// A number that must be finite but is not means a bug upstream: a collision
// that divided by zero, say. The simulation ignores such a value so its state
// stays sound, and reports it here. By default a report throws, so a test or
// Node script that meets one fails at the point it happened; the game
// installs warnOnInvalidNumber instead, which logs the value with a stack
// trace and keeps playing. The Elm simulation appends the same reports to its
// state's `invalid` list, and the differential tests hold the two equal.

export interface InvalidNumber {where: string; value: number}
export type InvalidNumberReporter = (problem: InvalidNumber) => void;

export const throwOnInvalidNumber: InvalidNumberReporter = ({where, value}) => {
  throw new Error(`Invalid number in ${where}: ${value}`);
};

export const warnOnInvalidNumber: InvalidNumberReporter = ({where, value}) => {
  console.warn(new Error(`Quiet Depths ignored an invalid number in ${where}: ${value}`));
};

let reporter: InvalidNumberReporter = throwOnInvalidNumber;

// Replaces the reporter and returns the one it replaced.
export function setInvalidNumberReporter(next: InvalidNumberReporter): InvalidNumberReporter {
  const previous = reporter;
  reporter = next;
  return previous;
}

export function reportInvalidNumber(where: string, value: number): void {
  reporter({where, value});
}

// Runs `work` with reports collected rather than thrown, for code that sends
// invalid numbers on purpose to check they are refused.
export function collectInvalidNumbers<T>(work: () => T): {result: T; reports: InvalidNumber[]} {
  const reports: InvalidNumber[] = [];
  const previous = setInvalidNumberReporter(problem => { reports.push(problem); });
  try {
    return {result: work(), reports};
  } finally {
    setInvalidNumberReporter(previous);
  }
}
