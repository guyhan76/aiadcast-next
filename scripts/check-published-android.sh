set -euo pipefail
package=com.selluplabs.aiadcast.next.preview
adb install -r aiadcast-0.2.90.apk
adb shell am start -n "$package/com.selluplabs.aiadcast.next.MainActivity"
for i in $(seq 1 36); do
  adb shell uiautomator dump /sdcard/aiadcast-ui.xml >/dev/null || true
  adb exec-out cat /sdcard/aiadcast-ui.xml > /tmp/aiadcast-ui.xml || true
  if python - <<'PY'
import xml.etree.ElementTree as ET
try:
    nodes=ET.parse('/tmp/aiadcast-ui.xml').iter('node')
    found=any(n.attrib.get('package')=='com.selluplabs.aiadcast.next.preview' and any(word in (n.attrib.get('text','')+' '+n.attrib.get('content-desc','')) for word in ('Continue with Google','Google로 계속하기')) for n in nodes)
except (OSError,ValueError,ET.ParseError):
    found=False
raise SystemExit(0 if found else 1)
PY
  then echo 'Published signed APK reached the Google sign-in control on Android 14, without choosing the offline fallback.'; exit 0; fi
  sleep 3
done
adb logcat -d -s chromium:W AndroidRuntime:E | tail -45
cat /tmp/aiadcast-ui.xml
exit 1
