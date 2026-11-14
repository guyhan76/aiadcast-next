set -euo pipefail
package=com.selluplabs.aiadcast.next.preview
adb install -r aiadcast-0.2.95.apk
adb shell dumpsys package "$package" | grep -E 'versionCode=97 |versionName=0\.2\.95-preview' > /tmp/aiadcast-version.txt
grep -q 'versionCode=97 ' /tmp/aiadcast-version.txt
grep -q 'versionName=0.2.95-preview' /tmp/aiadcast-version.txt
cat /tmp/aiadcast-version.txt
adb shell am start -n "$package/com.selluplabs.aiadcast.next.MainActivity"
for i in $(seq 1 36); do
  adb shell uiautomator dump /sdcard/aiadcast-ui.xml >/dev/null || true
  adb exec-out cat /sdcard/aiadcast-ui.xml > /tmp/aiadcast-ui.xml || true
  if python - <<'PY'
import os, xml.etree.ElementTree as ET
try:
    nodes=ET.parse('/tmp/aiadcast-ui.xml').iter('node')
    words=' '.join((n.get('text','')+' '+n.get('content-desc','')).lower() for n in nodes if n.get('package')=='com.selluplabs.aiadcast.next.preview')
except (OSError,ValueError,ET.ParseError):
    raise SystemExit(1)
login=any(s in words for s in ['continue with google','google로 계속하기'])
privacy=any(s in words for s in ['privacy policy','개인정보처리방침'])
storage=any(s in words for s in ['storage and deletion','자료 보관 및 탈퇴'])
if login and privacy and storage==(os.environ['EXPECTED_LAYOUT']=='previous'):
    print('Installed online APK shows privacy link; legacy storage/deletion link visible:',storage)
    raise SystemExit(0)
raise SystemExit(1)
PY
  then exit 0; fi
  sleep 3
done
cat /tmp/aiadcast-ui.xml
exit 1
