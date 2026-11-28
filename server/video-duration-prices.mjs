import {validVideoDuration} from '../src/video-duration.ts';
import {videoCreditsPerSecond} from '../src/pricing.ts';

// A server setting may restrict available lengths. All offered lengths use the same rate.
export function videoDurationPrices(setting = process.env.AIADCAST_VIDEO_DURATION_CREDITS) {
  let seconds = Array.from({length:21}, (_, i) => i + 10);
  if (setting) {
    try {
      const entries = JSON.parse(setting);
      if (!entries || typeof entries !== 'object' || Array.isArray(entries)) return {};
      seconds = Object.keys(entries).filter(key =>
        String(Number(key)) === key && validVideoDuration(Number(key)) &&
        Number.isSafeInteger(entries[key]) && entries[key] > 0 && entries[key] <= 1_000_000_000
      ).map(Number);
    } catch { return {}; }
  }
  return Object.fromEntries(seconds.map(s => [s, s * videoCreditsPerSecond]));
}
