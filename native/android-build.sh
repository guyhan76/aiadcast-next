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
tasks=("test${variant}UnitTest" "lint${variant}" "assemble${variant}")
# A cached Preview packaging run produced an unsigned APK in this environment.
# Rebuild Preview packaging cleanly and reject any unverifiable output.
if [[ "$variant" == Preview ]]; then tasks=(clean "${tasks[@]}"); fi
./gradlew --no-daemon "${tasks[@]}"
sdk_root="${ANDROID_HOME:-$ANDROID_SDK_ROOT}"
case "$variant" in
  Debug) apk_folder=debug ;;
  Preview) apk_folder=preview ;;
esac
apk_path="app/build/outputs/apk/$apk_folder/app-$apk_folder.apk"
"$sdk_root/build-tools/36.0.0/apksigner" verify "$apk_path"
"$sdk_root/build-tools/36.0.0/zipalign" -c -P 16 4 "$apk_path"
