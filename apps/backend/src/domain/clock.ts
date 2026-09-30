export type Clock = () => Date;

const realClock: Clock = () => new Date();
let activeClock: Clock = realClock;

export function now(): Date {
  return activeClock();
}

export function setClock(clock: Clock): void {
  activeClock = clock;
}

export function resetClock(): void {
  activeClock = realClock;
}
