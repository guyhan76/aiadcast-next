#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
case "${1:-debug}" in
  debug) variant=Debug ;;
  preview) variant=Preview ;;
  demo) variant=Demo ;;
  *) echo 'Usage: bash native/android-build.sh [debug|preview|demo]' >&2; exit 2 ;;
esac
if [[ -z "${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}" ]]; then
  echo 'Set ANDROID_HOME to the Android SDK with platform 36 and build-tools 36.0.0.' >&2
  exit 1
fi
if ! command -v javac >/dev/null 2>&1 && [[ ! -x "${JAVA_HOME:-}/bin/javac" ]]; then
  echo 'A full JDK 17 or later is required; a JRE alone cannot compile Android.' >&2
  exit 1
fi
if [[ "$variant" == Demo ]] && { [[ ! -f "${AIADCAST_DEMO_KEYSTORE:-}" ]] || [[ -z "${AIADCAST_DEMO_STORE_PASSWORD:-}" ]]; }; then
  echo 'Demo requires its explicitly provisioned private demo keystore and password.' >&2
  exit 1
fi
npm run build
node native/prepare-android.mjs
cd android
tasks=("test${variant}UnitTest" "lint${variant}" "assemble${variant}")
# A cached Preview packaging run produced an unsigned APK in this environment.
# Rebuild Preview packaging cleanly and reject any unverifiable output.
if [[ "$variant" == Preview || "$variant" == Demo ]]; then
  # Finish cleanup before scheduling packaging tasks. A combined task graph can
  # retain a stale incremental archive on the shared build filesystem.
  ./gradlew --no-daemon clean
  rm -rf app/build
fi
./gradlew --no-daemon "${tasks[@]}"
sdk_root="${ANDROID_HOME:-$ANDROID_SDK_ROOT}"
case "$variant" in
  Debug) apk_folder=debug ;;
  Preview) apk_folder=preview ;;
  Demo) apk_folder=demo ;;
esac
apk_path="app/build/outputs/apk/$apk_folder/app-$apk_folder.apk"
"$sdk_root/build-tools/36.0.0/apksigner" verify "$apk_path"
"$sdk_root/build-tools/36.0.0/zipalign" -c -P 16 4 "$apk_path"
