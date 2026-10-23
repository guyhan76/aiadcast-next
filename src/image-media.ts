// Legacy v1 omits mediaType. Explicit image is equivalent; other media fail closed.
// This discriminator is internal and is not appended to v1 JSON or fingerprints.
export const imageMediaType='image' as const;
export function supportsImageMedia(value:unknown):boolean {
 return value===undefined||value===imageMediaType;
}
