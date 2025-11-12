import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  PanResponder,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Platform,
  AppState,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { Accelerometer } from 'expo-sensors';
import FloatController from '@/modules/FloatController';

import { useColorScheme } from '@/hooks/use-color-scheme';

const { width: W, height: H } = Dimensions.get('window');

export default function FloatScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = colorScheme === 'dark'
    ? { background: '#050B18', card: '#0B1221', border: '#1F2A40', muted: '#7E8DA8', accent: '#3B82F6', success: '#22C55E' }
    : { background: '#F5F7FB', card: '#FFFFFF', border: '#E2E8F0', muted: '#5B6478', accent: '#2563EB', success: '#16A34A' };

  const size = 56;
  const margin = 16;
  const initialX = W - size - margin;
  const initialY = H * 0.7;

  const pan = useRef(new Animated.ValueXY({ x: initialX, y: initialY })).current;
  const [expanded, setExpanded] = useState(false);
  const [floatEnabled, setFloatEnabled] = useState(false);
  const [tiltX, setTiltX] = useState(0);
  const [rollDeg, setRollDeg] = useState(0);
  const [navIndex, setNavIndex] = useState(0);
  const [svcEnabled, setSvcEnabled] = useState(false);
  const lastTriggerRef = useRef(0);
  const armedRef = useRef(true);
  const baseRollRef = useRef<number | null>(null);

  const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

  const snapToEdge = useCallback((x: number, y: number) => {
    const snapX = x < W / 2 ? margin : W - size - margin;
    const clampedY = clamp(y, margin, H - size - margin - 60);
    Animated.spring(pan, {
      toValue: { x: snapX, y: clampedY },
      useNativeDriver: false,
      friction: 7,
      tension: 60,
    }).start();
  }, [pan]);

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 2 || Math.abs(g.dy) > 2,
        onPanResponderGrant: () => {
          pan.setOffset({ x: (pan as any).x._value, y: (pan as any).y._value });
        },
        onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], {
          useNativeDriver: false,
        }),
        onPanResponderRelease: (_, g) => {
          pan.flattenOffset();
          const nx = (pan as any).x._value;
          const ny = (pan as any).y._value;
          snapToEdge(nx, ny);
        },
      }),
    [pan, snapToEdge]
  );

  const openURL = async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch {}
  };

  const quickApps = [
    { name: 'maps', icon: 'map-pin' as const, url: 'https://maps.google.com' },
    { name: 'x', icon: 'twitter' as const, url: 'https://x.com' },
    { name: 'gmail', icon: 'mail' as const, url: 'mailto:' },
    { name: 'amazon', icon: 'shopping-bag' as const, url: 'https://www.amazon.com' },
  ];

  const floatApps = useMemo<{ name: string; icon: any; urls: string[] }[]>(() => [
    {
      name: 'maps',
      icon: 'map-pin',
      urls:
        Platform.OS === 'ios'
          ? ['maps://?q=coffee', 'comgooglemaps://?q=coffee', 'https://maps.google.com']
          : ['geo:0,0?q=coffee', 'https://maps.google.com'],
    },
    { name: 'x', icon: 'twitter', urls: ['twitter://timeline', 'https://x.com'] },
    { name: 'gmail', icon: 'mail', urls: ['googlegmail://co', 'mailto:'] },
    { name: 'amazon', icon: 'shopping-bag', urls: ['https://www.amazon.com'] },
    { name: 'youtube', icon: 'youtube', urls: ['vnd.youtube://', 'https://www.youtube.com'] },
  ], []);

  // Fallback opener: try deep link first, then web/app-safe URL
  async function openFirstAvailable(urls: string[]) {
    for (const u of urls) {
      try {
        // @ts-ignore canOpenURL available via expo-linking
        if (await Linking.canOpenURL(u)) return Linking.openURL(u);
      } catch {}
    }
    // Last resort: open the final URL
    return Linking.openURL(urls[urls.length - 1]);
  }

  // Tilt-driven navigation using relative roll (degrees)
  useEffect(() => {
    if (!floatEnabled) return;
    Accelerometer.setUpdateInterval(100);
    const alpha = 0.15; // low-pass filter
    const sub = Accelerometer.addListener(({ x, y, z }) => {
      setTiltX(x);
      const roll = (Math.atan2(y, z) * 180) / Math.PI; // degrees
      if (baseRollRef.current == null) baseRollRef.current = roll;
      const rel = roll - (baseRollRef.current ?? 0);
      setRollDeg((prev) => prev + alpha * (rel - prev));

      const now = Date.now();
      const cooldown = 1200; // ms between app switches
      const thresholdDeg = 15; // degrees
      // Re-arm in neutral zone
      if (Math.abs(rel) < 6) armedRef.current = true;
      if (!armedRef.current || now - lastTriggerRef.current < cooldown) return;
      if (rel > thresholdDeg) {
        setNavIndex((i) => {
          const ni = (i + 1) % floatApps.length;
          if (Platform.OS === 'android' && svcEnabled) {
            FloatController.nextApp();
          } else {
            openFirstAvailable(floatApps[ni].urls);
          }
          return ni;
        });
        armedRef.current = false;
        lastTriggerRef.current = now;
      } else if (rel < -thresholdDeg) {
        setNavIndex((i) => {
          const ni = (i - 1 + floatApps.length) % floatApps.length;
          if (Platform.OS === 'android' && svcEnabled) {
            FloatController.prevApp();
          } else {
            openFirstAvailable(floatApps[ni].urls);
          }
          return ni;
        });
        armedRef.current = false;
        lastTriggerRef.current = now;
      }
    });
    return () => {
      sub && sub.remove();
    };
  }, [floatEnabled, floatApps, svcEnabled]);

  // On float start, check if accessibility service is enabled on Android
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (Platform.OS === 'android' && floatEnabled) {
        const enabled = await FloatController.isServiceEnabled();
        if (mounted) setSvcEnabled(enabled);
      } else {
        if (mounted) setSvcEnabled(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [floatEnabled]);

  // Refresh service status after returning from background (user may enable it)
  useEffect(() => {
    const sub = AppState.addEventListener('change', async (state) => {
      if (state === 'active' && Platform.OS === 'android' && floatEnabled) {
        const enabled = await FloatController.isServiceEnabled();
        setSvcEnabled(enabled);
      }
    });
    return () => sub.remove();
  }, [floatEnabled]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}> 
      <View style={[styles.header, { borderColor: colors.border, backgroundColor: colors.card }]}> 
        <Text style={[styles.title, { color: colorScheme === 'dark' ? '#F8FAFF' : '#0F172A' }]}>Floating Mode</Text>
        <Text style={[styles.sub, { color: colors.muted }]}>
          A draggable quick-launch bubble. Like VPN toggles, tap once to start floating, tap again to stop.
        </Text>
      </View>

      <View style={styles.centerWrap}>
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => {
            if (!floatEnabled) {
              baseRollRef.current = null;
              pan.setValue({ x: initialX, y: initialY });
              setExpanded(false);
              setFloatEnabled(true);
            } else {
              setExpanded(false);
              setFloatEnabled(false);
            }
          }}
          style={[styles.bigButton, { borderColor: colors.border }]}
        >
          <View style={[styles.bigButtonInner, { backgroundColor: floatEnabled ? colors.success : colors.accent }]}>
            <Text style={styles.bigButtonLabel}>{floatEnabled ? 'ON' : 'Float'}</Text>
          </View>
          <Text style={[styles.bigSubLabel, { color: colors.muted }]}>
            {Platform.OS === 'android' ? `Service: ${svcEnabled ? 'ON' : 'OFF'}` : 'iOS limited'}
          </Text>
        </TouchableOpacity>
      </View>

      {Platform.OS === 'android' && floatEnabled && !svcEnabled && (
        <View
          style={[
            styles.notice,
            { borderColor: colors.border, backgroundColor: colors.card },
          ]}
        >
          <View style={styles.noticeHeader}>
            <Feather name="settings" size={16} color={colors.accent} />
            <Text style={[styles.noticeTitle, { color: colors.accent }]}>Accessibility service required</Text>
          </View>
          <Text style={[styles.noticeText, { color: colors.muted }]}>Open Android Accessibility and enable gesAir Floating Service to allow system-level app switching.</Text>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Open Android Accessibility Settings"
            onPress={() => FloatController.openAccessibilitySettings()}
            activeOpacity={0.9}
            style={[styles.noticePrimaryBtn, { backgroundColor: colors.accent }]}
          >
            <Feather name="external-link" size={16} color="#F8FAFF" />
            <Text style={styles.noticePrimaryText}>Open Accessibility Settings</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Floating button + quick actions */}
      {floatEnabled && expanded && (
        <View style={styles.overlay} pointerEvents="box-none">
          <View style={[styles.actions, { backgroundColor: colors.card, borderColor: colors.border }]}> 
            {quickApps.map((a) => (
              <TouchableOpacity key={a.name} style={styles.action} onPress={() => openURL(a.url)}>
                <Feather name={a.icon} size={18} color={colors.accent} />
                <Text style={[styles.actionText, { color: colors.muted }]}>{a.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {floatEnabled && (
        <Animated.View
          style={[styles.fab, { width: size, height: size, borderRadius: size / 2 }, pan.getLayout()]}
          {...responder.panHandlers}
        >
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => setExpanded((v) => !v)}
            style={[styles.fabInner, { backgroundColor: colors.accent }]}
          >
            <Feather name={expanded ? 'x' : 'grid'} size={22} color="#F8FAFF" />
          </TouchableOpacity>
        </Animated.View>
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
    width: 180,
    height: 180,
    borderRadius: 90,
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
    fontSize: 24,
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  bigSubLabel: {
    fontSize: 12,
    letterSpacing: 1,
  },
  toolbar: {
    marginHorizontal: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toolbarStatus: {
    fontSize: 14,
  },
  stopBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderRadius: 999,
    backgroundColor: 'transparent',
  },
  stopBtnText: {
    fontWeight: '700',
  },
  notice: {
    marginHorizontal: 16,
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    gap: 10,
  },
  noticeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
  },
  noticeTitle: { fontWeight: '700' },
  noticeText: { fontSize: 13, lineHeight: 18 },
  noticePrimaryBtn: {
    marginTop: 6,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
  },
  noticePrimaryText: { color: '#F8FAFF', fontWeight: '700' },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 24,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  fabInner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 100,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    padding: 12,
    borderRadius: 20,
    borderWidth: 1,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
  },
  actionText: { fontSize: 14, textTransform: 'capitalize' },
});
