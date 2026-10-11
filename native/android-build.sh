#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
case "${1:-debug}" in
  debug) variant=Debug ;;
  preview) variant=Preview ;;
  *) echo 'Usage: bash native/android-build.sh [debug|preview]' >&2; exit 2 ;;
esac
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
./gradlew --no-daemon "test${variant}UnitTest" "lint${variant}" "assemble${variant}"
