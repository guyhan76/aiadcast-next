export function buildInfo(options?:{env?:Record<string,string|undefined>;git?:()=>string}):{schemaVersion:number;service:string;version:string;commit:string|null};
export const serverBuild:ReturnType<typeof buildInfo>;
