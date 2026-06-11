// utils/webAlertShim.js
// react-native-web does not implement Alert.alert — it is a silent no-op in
// the browser. That made every confirmation dialog (delete location, approve
// leave, re-register face, …) and every Alert-based error message do nothing
// on web. This shim maps Alert.alert onto window.confirm / window.alert once,
// at startup, so all screens behave the same on web without per-screen code.
//
// Multi-button alerts degrade to OK/Cancel: OK fires the first non-cancel
// button, Cancel fires the cancel-style button (if any).

import { Alert, Platform } from 'react-native';

if (Platform.OS === 'web' && typeof window !== 'undefined') {
  Alert.alert = (title, message, buttons) => {
    const text = message ? `${title}\n\n${message}` : title;

    if (!buttons || buttons.length <= 1) {
      window.alert(text);
      buttons?.[0]?.onPress?.();
      return;
    }

    const confirmBtn = buttons.find((b) => b.style !== 'cancel') || buttons[buttons.length - 1];
    const cancelBtn  = buttons.find((b) => b.style === 'cancel');

    if (window.confirm(text)) confirmBtn?.onPress?.();
    else cancelBtn?.onPress?.();
  };
}
