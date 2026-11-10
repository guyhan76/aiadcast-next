import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.aiadcast.app',
  appName: 'AI Adcast',
  webDir: 'dist',
  // No server.url → production build is embedded in the APK
  android: {
    buildOptions: {
      // Signing secrets come from GitHub Actions env vars; not stored here.
    },
  },
};

export default config;
