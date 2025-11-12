import { NativeEventEmitter, NativeModules, Platform } from 'react-native';

type Result = {
  raw: string;
};

const M = (NativeModules as any).AcrCloud as
  | {
      isAvailable: () => Promise<boolean>;
      start: (host: string, key: string, secret: string) => Promise<boolean>;
      stop: () => Promise<boolean>;
    }
  | undefined;

const emitter = M && Platform.OS === 'android' ? new NativeEventEmitter(M as any) : undefined;

export function isAvailable() {
  return !!M && Platform.OS === 'android';
}

export async function start(host: string, key: string, secret: string) {
  if (!M || Platform.OS !== 'android') return false;
  try {
    return await M.start(host, key, secret);
  } catch {
    return false;
  }
}

export async function stop() {
  if (!M || Platform.OS !== 'android') return false;
  try {
    return await M.stop();
  } catch {
    return false;
  }
}

export function addResultListener(cb: (payload: Result) => void) {
  if (!emitter) return { remove: () => {} };
  const sub = emitter.addListener('AcrCloudResult', (raw: string) => cb({ raw }));
  return { remove: () => sub.remove() };
}

