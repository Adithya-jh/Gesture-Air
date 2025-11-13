import { NativeModules, Platform } from 'react-native';

type UsageItem = {
  packageName: string;
  uid: number;
  rxBytes: number;
  txBytes: number;
  lastTimeUsed: number; // ms
};

const M = (NativeModules as any).UsageMonitor as
  | {
      isAvailable: () => Promise<boolean>;
      hasUsageAccess: () => Promise<boolean>;
      openUsageAccessSettings: () => void;
      getNetworkSummary: (sinceMs: number) => Promise<UsageItem[]>;
    }
  | undefined;

export async function isAvailable() {
  if (Platform.OS !== 'android') return false;
  try { return (await M?.isAvailable?.()) ?? false } catch { return false }
}

export async function hasUsageAccess() {
  if (Platform.OS !== 'android') return false;
  try { return (await M?.hasUsageAccess?.()) ?? false } catch { return false }
}

export function openUsageAccessSettings() {
  if (Platform.OS !== 'android') return;
  try { M?.openUsageAccessSettings?.(); } catch {}
}

export async function getNetworkSummary(sinceMs: number): Promise<UsageItem[]> {
  if (Platform.OS !== 'android') return [];
  try { return (await M?.getNetworkSummary?.(sinceMs)) ?? [] } catch { return [] }
}

