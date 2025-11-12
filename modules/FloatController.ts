import { NativeModules, Platform, Linking as RNLinking } from 'react-native';

type FloatControllerType = {
  openAccessibilitySettings: () => Promise<void> | void;
  isServiceEnabled: () => Promise<boolean>;
  nextApp: () => void;
  prevApp: () => void;
};

const M = (NativeModules as any).FloatController as FloatControllerType | undefined;

const FloatController: FloatControllerType = {
  openAccessibilitySettings: async () => {
    if (Platform.OS !== 'android') return;
    // Prefer native module in dev client
    if (M?.openAccessibilitySettings) {
      try {
        return M.openAccessibilitySettings();
      } catch {}
    }
    // Fallback to intent URL (some devices support it)
    try {
      await RNLinking.openURL('intent:#Intent;action=android.settings.ACCESSIBILITY_SETTINGS;end');
      return;
    } catch {}
    // Fallback to app settings as last resort
    try {
      await RNLinking.openSettings();
    } catch {}
  },
  isServiceEnabled: async () => {
    if (Platform.OS !== 'android') return false;
    try {
      return (await M?.isServiceEnabled?.()) ?? false;
    } catch {
      return false;
    }
  },
  nextApp: () => {
    if (Platform.OS === 'android') M?.nextApp?.();
  },
  prevApp: () => {
    if (Platform.OS === 'android') M?.prevApp?.();
  },
};

export default FloatController;
