/** Seconds generated on each Google interaction, including the initial clip. */
export function omniTurns(seconds:number):number[] {
  if (!Number.isInteger(seconds) || seconds<10 || seconds>30) return [];
  if (seconds<=15) return [seconds];
  if (seconds<=25) {
    const first=Math.max(10,seconds-10);
    return [first,seconds-first];
  }
  const middle=Math.floor((seconds-10)/2);
  return [10,middle,seconds-10-middle];
}

export function omniBudget(seconds:number) {
  const turns=omniTurns(seconds);
  let length=0, returnedSeconds=0;
  for (const turn of turns) {length+=turn;returnedSeconds+=length;}
  return {calls:turns.length, outputEstimateUsd:returnedSeconds*0.069504, holdMicros:returnedSeconds*100000};
}
