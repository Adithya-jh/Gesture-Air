import { useSyncExternalStore } from 'react';
import { Platform, Alert } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';

import * as UsageMonitor from './UsageMonitor';

type AppUsage = {
  packageName: string;
  mb: number;
  rxMB: number;
  txMB: number;
  lastTimeUsed: number;
  hoursSinceUsed: number;
};

type NotificationsModule = typeof import('expo-notifications');
let NotificationsMod: NotificationsModule | null = null;
const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

async function loadNotifications(): Promise<NotificationsModule | null> {
  if (NotificationsMod !== null) return NotificationsMod;
  if (isExpoGo) return null; // not supported in Expo Go
  try {
    NotificationsMod = await import('expo-notifications');
  } catch {
    NotificationsMod = null;
  }
  return NotificationsMod;
}

type OptimizeState = {
  enabled: boolean;
  svcAvailable: boolean;
  hasUsageAccess: boolean;
  summary: AppUsage[];
  offenders: AppUsage[];
  totalMB: number;
  lookbackMinutes: number;
  perAppThresholdMB: number;
  totalThresholdMB: number;
};

const DEFAULT_STATE: OptimizeState = {
  enabled: false,
  svcAvailable: false,
  hasUsageAccess: false,
  summary: [],
  offenders: [],
  totalMB: 0,
  lookbackMinutes: 1,
  perAppThresholdMB: 1,
  totalThresholdMB: 5,
};

let state: OptimizeState = { ...DEFAULT_STATE };
const listeners = new Set<() => void>();
let pollTimer: NodeJS.Timer | null = null;
let lastNotificationTs = 0;
const NOTIFY_COOLDOWN_MS = 15 * 60 * 1000;

const emit = () => listeners.forEach((l) => l());

async function ensureNotifications() {
  const Notifications = await loadNotifications();
  if (!Notifications) return;
  const { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') await Notifications.requestPermissionsAsync();
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('optimize', {
      name: 'Optimize',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
}

async function refreshAvailability() {
  const svc = await UsageMonitor.isAvailable();
  const access = svc ? await UsageMonitor.hasUsageAccess() : false;
  state = { ...state, svcAvailable: svc, hasUsageAccess: access };
  emit();
}

async function notifyOffenders(offenders: AppUsage[], totalMB: number) {
  if (!offenders.length) return;
  if (!state.hasUsageAccess && Platform.OS === 'android') return;
  const now = Date.now();
  if (now - lastNotificationTs < NOTIFY_COOLDOWN_MS) return;
  const msg = `High background usage (~${totalMB.toFixed(0)} MB last ${state.lookbackMinutes}m).\n` +
    offenders
      .slice(0, 5)
      .map((o) => `${o.packageName} (${o.mb.toFixed(1)} MB)`) 
      .join(', ') + '\n\nClose these apps to optimize performance.';
  const Notifications = await loadNotifications();
  if (Notifications) {
    await Notifications.scheduleNotificationAsync({
      content: { title: 'Optimize mode', body: msg, sound: 'default', vibrate: [200] },
      trigger: null,
    });
  } else {
    Alert.alert('Optimize mode', msg);
  }
  lastNotificationTs = now;
}

async function runCheck() {
  if (!state.enabled) return;
  const lookbackMs = state.lookbackMinutes * 60 * 1000;
  if (Platform.OS === 'android' && state.svcAvailable) {
    const access = await UsageMonitor.hasUsageAccess();
    if (access !== state.hasUsageAccess) {
      state = { ...state, hasUsageAccess: access };
      emit();
    }
    if (!access) {
      state = { ...state, summary: [], offenders: [], totalMB: 0 };
      emit();
      return;
    }
  }
  const usage = await UsageMonitor.getNetworkSummary(lookbackMs);
  if (!usage?.length) {
    state = { ...state, summary: [], offenders: [], totalMB: 0 };
    emit();
    return;
  }
  const now = Date.now();
  const summary: AppUsage[] = usage.map((item: any) => {
    const totalBytes = (item.rxBytes || 0) + (item.txBytes || 0);
    const mb = item.mb ?? totalBytes / (1024 * 1024);
    const rxMB = item.rxMB ?? (item.rxBytes || 0) / (1024 * 1024);
    const txMB = item.txMB ?? (item.txBytes || 0) / (1024 * 1024);
    const lastTimeUsed = item.lastTimeUsed || Date.now();
    const hoursSinceUsed = item.hoursSinceUsed ?? (now - lastTimeUsed) / (1000 * 60 * 60);
    return {
      packageName: item.packageName,
      mb,
      rxMB,
      txMB,
      lastTimeUsed,
      hoursSinceUsed,
    };
  });
  summary.sort((a, b) => b.mb - a.mb);
  const offenders = summary.filter(
    (s) => s.mb >= state.perAppThresholdMB && s.hoursSinceUsed >= 2
  );
  const totalMB = summary.reduce((sum, item) => sum + item.mb, 0);
  state = { ...state, summary, offenders, totalMB };
  emit();
  if (
    totalMB >= state.totalThresholdMB &&
    offenders.length &&
    Platform.OS === 'android'
  ) {
    await notifyOffenders(offenders, totalMB);
  }
}

function schedule() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(runCheck, 60_000);
}

export async function start() {
  if (state.enabled) return;
  await ensureNotifications();
  await refreshAvailability();
  lastNotificationTs = 0;
  state = {
    ...state,
    enabled: true,
    summary: [],
    offenders: [],
    totalMB: 0,
  };
  emit();
  schedule();
  await runCheck();
}

export function stop() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
  state = { ...state, enabled: false };
  emit();
}

export function toggle() {
  if (state.enabled) stop();
  else start();
}

export function setLookbackMinutes(minutes: number) {
  state = { ...state, lookbackMinutes: minutes };
  emit();
  if (state.enabled) runCheck();
}

export function adjustPerAppThreshold(delta: number) {
  const next = Math.max(1, state.perAppThresholdMB + delta);
  state = { ...state, perAppThresholdMB: next };
  emit();
  if (state.enabled) runCheck();
}

export function adjustTotalThreshold(delta: number) {
  const next = Math.max(5, state.totalThresholdMB + delta);
  state = { ...state, totalThresholdMB: next };
  emit();
  if (state.enabled) runCheck();
}

export function openUsageAccessSettings() {
  UsageMonitor.openUsageAccessSettings();
}

export function useOptimizeState() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state
  );
}
