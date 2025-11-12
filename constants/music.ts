import Constants from 'expo-constants';

// Prefer loading the token from safe sources so you don't hardcode it in git:
// - Set env var before starting: `EXPO_PUBLIC_AUDD_API_TOKEN=xxxxx expo start`
// - Or put it in app.json under `expo.extra.AUDD_API_TOKEN`
const extra =
  (Constants.expoConfig as any)?.extra ||
  (Constants.manifest as any)?.extra ||
  {};
const AUDD_ENV = process.env.EXPO_PUBLIC_AUDD_API_TOKEN;

const ACR_HOST =
  process.env.EXPO_PUBLIC_ACR_HOST ||
  extra.ACR_HOST ||
  'identify-ap-southeast-1.acrcloud.com';
const ACR_ACCESS_KEY =
  process.env.EXPO_PUBLIC_ACR_ACCESS_KEY ||
  extra.ACR_ACCESS_KEY ||
  '84313fcb2833ccda6f17c1c926a24fb4';
const ACR_ACCESS_SECRET =
  process.env.EXPO_PUBLIC_ACR_ACCESS_SECRET ||
  extra.ACR_ACCESS_SECRET ||
  'i8j9b83DNvlTO7vod9qrkwMhAskrwA1Xy2ygd55W';
const ACR_PROXY_URL =
  process.env.EXPO_PUBLIC_ACR_PROXY_URL || extra.ACR_PROXY_URL || '';
const ACR_BEARER = process.env.EXPO_PUBLIC_ACR_BEARER || extra.ACR_BEARER || '';
const ACOUSTID_PROXY_URL =
  process.env.EXPO_PUBLIC_ACOUSTID_PROXY_URL || extra.ACOUSTID_PROXY_URL || '';

export const MUSIC = {
  AUDD_API_TOKEN: AUDD_ENV || extra.AUDD_API_TOKEN || '',
  ACR_HOST,
  ACR_ACCESS_KEY,
  ACR_ACCESS_SECRET,
  ACR_PROXY_URL,
  ACR_BEARER,
  ACOUSTID_PROXY_URL,
};
