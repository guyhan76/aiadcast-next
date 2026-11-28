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

export type SceneCue={endFrame:string;dialogue:string;sound:string};

export function validSceneCues(input:unknown):input is SceneCue[] {
  return Array.isArray(input)&&input.length===3&&input.every(c=>c&&
    typeof c.endFrame==='string'&&!!c.endFrame.trim()&&c.endFrame.length<=200&&
    typeof c.dialogue==='string'&&c.dialogue.length<=180&&
    typeof c.sound==='string'&&!!c.sound.trim()&&c.sound.length<=140);
}

/** Keep the three editable scenes, placing each transition inside exactly one paid turn. */
export function omniSceneTiming(seconds:number){
  const turns=omniTurns(seconds);
  const [first,second]=turns;
  const stops=turns.length===3?[0,first,first+second,seconds]:
    turns.length===2?[0,Math.round(first/2),first,seconds]:
    [0,Math.round(seconds*.3),Math.round(seconds*.7),seconds];
  const groups=turns.length===3?[[0],[1],[2]]:turns.length===2?[[0,1],[2]]:[[0,1,2]];
  return {stops,groups};
}
