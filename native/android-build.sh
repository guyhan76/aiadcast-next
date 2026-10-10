#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ -z "${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}" ]]; then
  echo 'Set ANDROID_HOME to the Android SDK with platform 36 and build-tools 36.0.0.' >&2
  exit 1
fi
if ! command -v javac >/dev/null 2>&1 && [[ ! -x "${JAVA_HOME:-}/bin/javac" ]]; then
  echo 'A full JDK 17 or later is required; a JRE alone cannot compile Android.' >&2
  exit 1
fi
npm run build
node native/prepare-android.mjs
cd android
./gradlew --no-daemon testDebugUnitTest lintDebug assembleDebug
