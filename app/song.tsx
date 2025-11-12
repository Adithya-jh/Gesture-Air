import React, { useEffect, useRef, useState } from 'react';
import { Alert, SafeAreaView, StyleSheet, Text, TouchableOpacity, View, ScrollView } from 'react-native';
import * as Linking from 'expo-linking';
import Constants from 'expo-constants';
import * as Clipboard from 'expo-clipboard';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { MUSIC } from '@/constants/music';
import { getAudio } from '@/modules/expo-av';
import * as FileSystem from 'expo-file-system';

export default function SongScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = colorScheme === 'dark'
    ? { background: '#050B18', card: '#0B1221', border: '#1F2A40', muted: '#7E8DA8', accent: '#3B82F6', success: '#22C55E' }
    : { background: '#F5F7FB', card: '#FFFFFF', border: '#E2E8F0', muted: '#5B6478', accent: '#2563EB', success: '#16A34A' };

  const [listening, setListening] = useState(false);
  const [statusText, setStatusText] = useState('Idle');
  const recordingRef = useRef<any>(null);
  const autoTimerRef = useRef<NodeJS.Timeout | null>(null);
  const tickRef = useRef<NodeJS.Timeout | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [preparing, setPreparing] = useState(false);
  const busyRef = useRef(false);
  const [debugOpen, setDebugOpen] = useState(false);
  const [lastPath, setLastPath] = useState<string | null>(null);
  const [lastRaw, setLastRaw] = useState<string>('');

  const LISTEN_SECONDS = Number(
    ((Constants.expoConfig as any)?.extra?.MUSIC_LISTEN_SECONDS ??
      (Constants.manifest as any)?.extra?.MUSIC_LISTEN_SECONDS ??
      process.env.EXPO_PUBLIC_MUSIC_LISTEN_SECONDS) || 20
  ); // Default 20s; configurable via env/app.json
  const [listenSeconds, setListenSeconds] = useState(LISTEN_SECONDS);

  function clearTimers() {
    if (autoTimerRef.current) clearTimeout(autoTimerRef.current);
    if (tickRef.current) clearInterval(tickRef.current);
    autoTimerRef.current = null;
    tickRef.current = null;
  }

  async function cleanupRecordingSafe() {
    try {
      if (recordingRef.current) {
        const rec = recordingRef.current;
        try {
          const status = await rec.getStatusAsync();
          if (status?.isRecording || status?.canRecord) {
            try { await rec.stopAndUnloadAsync(); } catch {}
          }
        } catch {}
      }
    } finally {
      recordingRef.current = null;
    }
  }

  async function getHQRecordingOptions(Audio: any) {
    // Force AAC/MPEG4 (m4a) on both platforms for better recognition
    return {
      android: {
        extension: '.m4a',
        outputFormat: Audio.RECORDING_OPTION_ANDROID_OUTPUT_FORMAT_MPEG_4,
        audioEncoder: Audio.RECORDING_OPTION_ANDROID_AUDIO_ENCODER_AAC,
        sampleRate: 44100,
        numberOfChannels: 1,
        bitRate: 128000,
      },
      ios: {
        extension: '.m4a',
        outputFormat: Audio.RECORDING_OPTION_IOS_OUTPUT_FORMAT_MPEG4AAC,
        audioQuality: Audio.RECORDING_OPTION_IOS_AUDIO_QUALITY_MAX,
        sampleRate: 44100,
        numberOfChannels: 1,
        bitRate: 128000,
      },
      web: {},
    } as const;
  }

  useEffect(() => {
    (async () => {
      try {
        const Audio = await getAudio();
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
          shouldDuckAndroid: false,
        });
      } catch (e) {
        // Ignore here; surface during Listen press for clearer UX
      }
    })();
  }, []);

  async function startListening() {
    try {
      if (busyRef.current || preparing || listening) return;
      busyRef.current = true;
      setPreparing(true);
      let Audio: any;
      try {
        Audio = await getAudio();
      } catch {
        Alert.alert(
          'Install dependency',
          'Run "npx expo install expo-av" and restart with cache clear (expo start -c).'
        );
        return;
      }
      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Microphone needed', 'Please allow microphone access to recognize songs.');
        return;
      }
      // Ensure no leftover prepared recording exists
      await cleanupRecordingSafe();
      // Give OS a brief moment to release mic after a stop
      await new Promise((r) => setTimeout(r, 150));

      setElapsedSec(0);
      setStatusText('Listening...');
      const opts = await getHQRecordingOptions(Audio);
      let rec: any;
      // Prefer createAsync which internally prepares and starts
      try {
        const created: any = await (Audio.Recording as any).createAsync(opts as any);
        rec = created.recording || created; // API returns { recording }
      } catch (err: any) {
        // Fallback to manual prepare/start once if createAsync failed
        rec = new Audio.Recording();
        try {
          await rec.prepareToRecordAsync(opts as any);
          await rec.startAsync();
        } catch (e) {
          // One last cleanup + retry guard
          await cleanupRecordingSafe();
          await new Promise((r) => setTimeout(r, 100));
          await rec.prepareToRecordAsync(opts as any);
          await rec.startAsync();
        }
      }
      recordingRef.current = rec;
      setListening(true);
      // auto-stop after target seconds
      autoTimerRef.current = setTimeout(() => { stopAndPredict(); }, listenSeconds * 1000);
      tickRef.current = setInterval(() => { setElapsedSec((s) => s + 1); }, 1000);
    } catch (e: any) {
      setListening(false);
      setStatusText('Idle');
      Alert.alert('Failed to start', e?.message ?? String(e));
    }
    finally {
      setPreparing(false);
      busyRef.current = false;
    }
  }

  async function stopAndPredict() {
    try {
      if (busyRef.current) return;
      busyRef.current = true;
      clearTimers();
      setStatusText('Processing...');
      const rec = recordingRef.current;
      if (!rec) {
        setListening(false);
        setStatusText('Idle');
        Alert.alert('Nothing recorded', 'Tap Listen to start.');
        return;
      }
      let Audio: any;
      try {
        Audio = await getAudio();
      } catch {
        Alert.alert(
          'Install dependency',
          'Run "npx expo install expo-av" and restart with cache clear (expo start -c).'
        );
        setStatusText('Idle');
        return;
      }
      await rec.stopAndUnloadAsync();
      const uri = rec.getURI();
      recordingRef.current = null;
      setListening(false);
      if (!uri) {
        setStatusText('Idle');
        Alert.alert('No audio', 'Could not read the audio buffer.');
        return;
      }

      // Prefer free ACRCloud first if configured
      let title: string | undefined;
      let artist: string | undefined;
      let spotifyTrackId: string | undefined;

      // 0) Native ACR (Android dev build with SDK jar) — attempt first if available
      try {
        const { default: AcrNativeModule } = await import('@/modules/AcrNative');
        if (!title && AcrNativeModule && AcrNativeModule.isAvailable && AcrNativeModule.isAvailable()) {
          try {
            const ok = await AcrNativeModule.start(MUSIC.ACR_HOST, MUSIC.ACR_ACCESS_KEY, MUSIC.ACR_ACCESS_SECRET);
            if (ok) {
              const resNative: any = await new Promise((resolve) => {
                const sub = AcrNativeModule.addResultListener((p: any) => {
                  try {
                    const json = JSON.parse(p.raw || '{}');
                    resolve(json);
                  } catch {
                    resolve({});
                  } finally {
                    sub.remove();
                  }
                });
              });
              await AcrNativeModule.stop();
              try { setLastRaw(JSON.stringify(resNative, null, 2)); } catch { setLastRaw(String(resNative)); }
              setLastPath('native');
              const m = resNative?.metadata?.music?.[0];
              if (m) {
                title = m.title;
                artist = m.artists?.[0]?.name || m.artist;
                spotifyTrackId = m.external_metadata?.spotify?.track?.id;
              }
            }
          } catch {}
        }
      } catch {}

      // 1) Token + proxy path (your server holds keys & calls ACRCloud)
      if (!title && MUSIC.ACR_PROXY_URL && MUSIC.ACR_BEARER) {
        try {
          const fd = new FormData();
          // @ts-ignore RN FormData file
          fd.append('file', { uri, name: 'sample.m4a', type: 'audio/m4a' });
          const res = await fetch(MUSIC.ACR_PROXY_URL, {
            method: 'POST',
            headers: { Authorization: `Bearer ${MUSIC.ACR_BEARER}` },
            body: fd as any,
          });
          const prox = await res.json();
          try { setLastRaw(JSON.stringify(prox, null, 2)); } catch { setLastRaw(String(prox)); }
          setLastPath('proxy');
          // Try to parse ACR-like payload
          const m = prox?.metadata?.music?.[0];
          if (m) {
            title = m.title;
            artist = m.artists?.[0]?.name || m.artist;
            spotifyTrackId = m.external_metadata?.spotify?.track?.id;
          } else if (prox?.title && prox?.artist) {
            // Or normalized payload from your server
            title = prox.title;
            artist = prox.artist;
            spotifyTrackId = prox.spotifyTrackId;
          }
        } catch {}
      }

      // 2) AcoustID via proxy (Chromaprint server) — free community DB
      if (!title && MUSIC.ACOUSTID_PROXY_URL) {
        try {
          const fd = new FormData();
          // @ts-ignore RN FormData file
          fd.append('file', { uri, name: 'sample.m4a', type: 'audio/m4a' });
          const res = await fetch(MUSIC.ACOUSTID_PROXY_URL, { method: 'POST', body: fd as any });
          const out = await res.json();
          try { setLastRaw(JSON.stringify(out, null, 2)); } catch { setLastRaw(String(out)); }
          setLastPath('acoustidProxy');
          if (out?.title && out?.artist) {
            title = out.title;
            artist = out.artist;
            if (out.spotifyTrackId) spotifyTrackId = out.spotifyTrackId;
          } else if (Array.isArray(out?.candidates) && out.candidates.length) {
            const c = out.candidates[0];
            title = c.title || title;
            artist = c.artist || artist;
          }
        } catch {}
      }

      // 3) Direct ACR identify path (host + access key/secret)
      if (!title && MUSIC.ACR_HOST && MUSIC.ACR_ACCESS_KEY && MUSIC.ACR_ACCESS_SECRET) {
        try {
          const info = await FileSystem.getInfoAsync(uri);
          const sampleBytes = info.size ?? 0;
          const method = 'POST';
          const httpUri = '/v1/identify';
          const dataType = 'audio';
          const signatureVersion = '1';
          const timestamp = Math.floor(Date.now() / 1000);
          const stringToSign = [method, httpUri, MUSIC.ACR_ACCESS_KEY, dataType, signatureVersion, timestamp].join('\n');
          // Lazy-load crypto-js to avoid bundling issues until installed
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const CryptoJS = require('crypto-js');
          const sig = CryptoJS.HmacSHA1(stringToSign, MUSIC.ACR_ACCESS_SECRET).toString(CryptoJS.enc.Base64);

          const fd = new FormData();
          fd.append('access_key', MUSIC.ACR_ACCESS_KEY);
          fd.append('data_type', dataType);
          fd.append('signature_version', signatureVersion);
          fd.append('signature', sig);
          fd.append('sample_bytes', String(sampleBytes));
          // @ts-ignore RN FormData file
          fd.append('sample', { uri, name: 'sample.m4a', type: 'audio/m4a' });
          fd.append('timestamp', String(timestamp));

          // Provide additional hint about the audio container to ACR
          fd.append('audio_format', 'm4a');
          const res = await fetch(`https://${MUSIC.ACR_HOST}${httpUri}`, { method: 'POST', body: fd as any });
          const acr = await res.json();
          try { setLastRaw(JSON.stringify(acr, null, 2)); } catch { setLastRaw(String(acr)); }
          setLastPath('acrDirect');
          const music = acr?.metadata?.music?.[0];
          if (music) {
            title = music.title;
            artist = (music.artists?.[0]?.name) || music.artist;
            const sp = music.external_metadata?.spotify?.track?.id || music.external_metadata?.spotify?.track?.id;
            if (sp) spotifyTrackId = sp;
          } else if (acr?.status) {
            // Surface ACR status to help debugging match issues
            const code = acr.status?.code;
            const msg = acr.status?.msg || acr.status?.message;
            if (!title) {
              console.log('ACR status', code, msg);
              setStatusText(`ACR ${code || ''} ${msg || ''}`.trim());
            }
          }
        } catch (e) {
          // swallow; we'll fallback to AudD if available
        }
      }

      // 4) Fallback to AudD if configured and no result yet
      if (!title && MUSIC.AUDD_API_TOKEN) {
        try {
          const form = new FormData();
          form.append('api_token', MUSIC.AUDD_API_TOKEN);
          form.append('return', 'spotify');
          // @ts-ignore RN FormData file
          form.append('file', { uri, name: 'sample.m4a', type: 'audio/m4a' });
          const res = await fetch('https://api.audd.io/', { method: 'POST', body: form as any, headers: { Accept: 'application/json' } });
          const json = await res.json();
          try { setLastRaw(JSON.stringify(json, null, 2)); } catch { setLastRaw(String(json)); }
          setLastPath('audd');
          const r = json?.result;
          if (r) {
            title = r.title;
            artist = r.artist;
            spotifyTrackId = r.spotify?.id || r.spotify?.track?.id;
          }
        } catch {}
      }

      if (!title) {
        setStatusText('Idle');
        const hint = `Tips:\n• Capture ~${listenSeconds}s near the speaker.\n• Aim for chorus/hook, reduce background talk/noise.\n• Increase source volume and hold phone mic closer.`;
        Alert.alert('No match', `${hint}${statusText.startsWith('ACR') ? `\n\n${statusText}` : ''}`);
        return;
      }
      // At this point we have a title/artist (and maybe spotify id)
      setStatusText(`${artist} — ${title}`);

      if (spotifyTrackId) {
        // Try deep link first, then web fallback
        const deep = `spotify://track/${spotifyTrackId}`;
        try {
          await Linking.openURL(deep);
          return;
        } catch {}
        await Linking.openURL(`https://open.spotify.com/track/${spotifyTrackId}`);
        return;
      }

      // Fallback to search if track id unavailable
      const query = encodeURIComponent(`${artist} ${title}`);
      const deepSearch = `spotify://search?q=${query}`;
      try {
        await Linking.openURL(deepSearch);
        return;
      } catch {}
      await Linking.openURL(`https://open.spotify.com/search/${query}`);
    } catch (e: any) {
      Alert.alert('Predict failed', e?.message ?? String(e));
      setStatusText('Idle');
    } finally {
      setListening(false);
      busyRef.current = false;
    }
  }

  // Clean up if navigating away mid-recording
  useEffect(() => {
    return () => {
      clearTimers();
      cleanupRecordingSafe();
    };
  }, []);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}> 
      <View style={[styles.header, { borderColor: colors.border, backgroundColor: colors.card }]}> 
        <Text style={[styles.title, { color: colorScheme === 'dark' ? '#F8FAFF' : '#0F172A' }]}>Find & Play the song</Text>
        <Text style={[styles.sub, { color: colors.muted }]}>Listen to a short clip, recognize it, and play in Spotify.</Text>
      </View>

      <View style={styles.durationsRow}>
        {[8, 12, 20, 30].map((s) => {
          const active = listenSeconds === s;
          return (
            <TouchableOpacity
              key={s}
              disabled={listening}
              onPress={() => setListenSeconds(s)}
              style={[
                styles.durationChip,
                {
                  borderColor: active ? colors.accent : colors.border,
                  backgroundColor: active ? `${colors.accent}22` : 'transparent',
                  opacity: listening ? 0.6 : 1,
                },
              ]}
              activeOpacity={0.85}
            >
              <Text style={{ color: active ? colors.accent : colors.muted }}>{s}s</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.centerWrap}>
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={listening ? stopAndPredict : startListening}
          style={[styles.bigButton, { borderColor: colors.border }]}
        >
          <View style={[
            styles.bigButtonInner,
            { backgroundColor: listening ? colors.success : colors.accent },
          ]}>
            <Text style={styles.bigButtonLabel}>{listening ? 'Stop & Predict' : 'Listen'}</Text>
          </View>
          <Text style={[styles.bigSubLabel, { color: colors.muted }]}> 
            {listening ? `Listening… ${elapsedSec}s / ${listenSeconds}s` : statusText}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={{ paddingHorizontal: 16, marginBottom: 16 }}>
        <TouchableOpacity
          onPress={() => setDebugOpen((v) => !v)}
          style={{ alignSelf: 'flex-start', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: colors.border }}
          activeOpacity={0.85}
        >
          <Text style={{ color: colors.muted }}>{debugOpen ? 'Hide debug' : 'Show debug'}</Text>
        </TouchableOpacity>
      </View>
      {debugOpen && (
        <View style={{ marginHorizontal: 16, marginBottom: 24, borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.card }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 10 }}>
            <Text style={{ color: colors.muted }}>Last method: {lastPath ?? 'n/a'}</Text>
            <TouchableOpacity onPress={async () => { try { await Clipboard.setStringAsync(lastRaw || ''); Alert.alert('Copied'); } catch {} }}>
              <Text style={{ color: colors.accent, fontWeight: '700' }}>Copy</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={{ maxHeight: 220, paddingHorizontal: 10, paddingBottom: 10 }}>
            <Text style={{ color: colors.muted, fontFamily: 'monospace' }}>{lastRaw || '(no payload captured)'}</Text>
          </ScrollView>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    margin: 16,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    gap: 8,
  },
  title: { fontSize: 22, fontWeight: '700' },
  sub: { fontSize: 14, lineHeight: 20 },
  durationsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  durationChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  centerWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bigButton: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: 10,
    borderRadius: 200,
    borderWidth: 1,
  },
  bigButtonInner: {
    width: 200,
    height: 200,
    borderRadius: 100,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 6,
  },
  bigButtonLabel: {
    color: '#F8FAFF',
    fontWeight: '800',
    fontSize: 20,
    textTransform: 'uppercase',
    letterSpacing: 1,
    textAlign: 'center',
    paddingHorizontal: 10,
  },
  bigSubLabel: {
    fontSize: 12,
    letterSpacing: 1,
  },
});
