// Each entry is the total customer credit price for that duration.
export function videoDurationPrices(setting = process.env.AIADCAST_VIDEO_DURATION_CREDITS) {
  if (!setting) return {};
  try {
    const entries = JSON.parse(setting);
    if (!entries || typeof entries !== 'object' || Array.isArray(entries)) return {};
    return Object.fromEntries([10, 15, 20, 30].filter(seconds =>
      Number.isSafeInteger(entries?.[seconds]) && entries[seconds] >= 0
    ).map(seconds => [seconds, entries[seconds]]));
  } catch {
    return {};
  }
}
