import React from 'react';
import { Platform, SafeAreaView, StyleSheet, Text, TouchableOpacity, View, ScrollView } from 'react-native';

import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  useOptimizeState,
  toggle,
  openUsageAccessSettings,
  setLookbackMinutes,
  adjustPerAppThreshold,
  adjustTotalThreshold,
} from '@/modules/optimize-manager';

function formatLastUsed(ms: number) {
  if (!ms) return 'Never';
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function OptimizeScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = colorScheme === 'dark'
    ? { background: '#050B18', card: '#0B1221', border: '#1F2A40', muted: '#7E8DA8', accent: '#3B82F6', success: '#22C55E' }
    : { background: '#F5F7FB', card: '#FFFFFF', border: '#E2E8F0', muted: '#5B6478', accent: '#2563EB', success: '#16A34A' };

  const state = useOptimizeState();
  const { enabled, svcAvailable, hasUsageAccess, summary, offenders, totalMB, lookbackMinutes, perAppThresholdMB, totalThresholdMB } = state;

  const topTalkers = summary.slice(0, 5);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}> 
      <ScrollView contentContainerStyle={{ paddingBottom: 80 }}> 
      <View style={[styles.header, { borderColor: colors.border, backgroundColor: colors.card }]}> 
        <Text style={[styles.title, { color: colorScheme === 'dark' ? '#F8FAFF' : '#0F172A' }]}>Optimize</Text>
        <Text style={[styles.sub, { color: colors.muted }]}>Monitor background usage and nudge you when inactive apps consume bandwidth.</Text>
      </View>

      {Platform.OS === 'android' && enabled && svcAvailable && !hasUsageAccess && (
        <View style={[styles.notice, { borderColor: colors.border, backgroundColor: colors.card }]}> 
          <Text style={[styles.noticeText, { color: colors.muted }]}>Enable Usage Access so Optimize can read background stats.</Text>
          <TouchableOpacity onPress={openUsageAccessSettings} style={[styles.noticeBtn, { borderColor: colors.border }]}> 
            <Text style={{ color: colors.accent, fontWeight: '700' }}>Open Settings</Text>
          </TouchableOpacity>
        </View>
      )}

      {Platform.OS === 'ios' && (
        <View style={[styles.notice, { borderColor: colors.border, backgroundColor: colors.card }]}> 
          <Text style={[styles.noticeText, { color: colors.muted }]}>iOS limits third-party apps from reading other apps usage, so Optimize suggestions are limited.</Text>
        </View>
      )}

      <View style={styles.centerWrap}>
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={toggle}
          style={[styles.bigButton, { borderColor: colors.border }]}
        >
          <View style={[styles.bigButtonInner, { backgroundColor: enabled ? colors.success : colors.accent }]}> 
            <Text style={styles.bigButtonLabel}>{enabled ? 'Optimize mode ON' : 'Turn on Optimize mode'}</Text>
          </View>
          <Text style={[styles.bigSubLabel, { color: colors.muted }]}> 
            {Platform.OS === 'android'
              ? `Usage Access: ${hasUsageAccess ? 'ON' : 'OFF'}`
              : 'System stats limited on iOS'}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.settingsCard, { borderColor: colors.border, backgroundColor: colors.card }]}> 
        <Text style={[styles.settingsTitle, { color: colorScheme === 'dark' ? '#F8FAFF' : '#0F172A' }]}>Monitoring settings</Text>
        <View style={{ gap: 12 }}>
          <View>
            <Text style={[styles.settingsLabel, { color: colors.muted }]}>Lookback window</Text>
            <View style={styles.chipRow}>
              {[1, 5, 10].map((min) => {
                const active = lookbackMinutes === min;
                return (
                  <TouchableOpacity
                    key={min}
                    onPress={() => setLookbackMinutes(min)}
                    style={[
                      styles.chip,
                      {
                        borderColor: active ? colors.accent : colors.border,
                        backgroundColor: active ? `${colors.accent}22` : 'transparent',
                      },
                    ]}
                    activeOpacity={0.85}
                  >
                    <Text style={{ color: active ? colors.accent : colors.muted }}>{min}m</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View style={styles.stepRow}>
            <Text style={[styles.settingsLabel, { color: colors.muted }]}>Per-app threshold</Text>
            <View style={styles.stepControls}>
              <TouchableOpacity onPress={() => adjustPerAppThreshold(-5)} style={[styles.stepBtn, { borderColor: colors.border }]}> 
                <Text style={{ color: colors.muted }}>-</Text>
              </TouchableOpacity>
              <Text style={{ color: colorScheme === 'dark' ? '#F8FAFF' : '#0F172A', minWidth: 60, textAlign: 'center' }}>{perAppThresholdMB} MB</Text>
              <TouchableOpacity onPress={() => adjustPerAppThreshold(5)} style={[styles.stepBtn, { borderColor: colors.border }]}> 
                <Text style={{ color: colors.muted }}>+</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.stepRow}>
            <Text style={[styles.settingsLabel, { color: colors.muted }]}>Total threshold</Text>
            <View style={styles.stepControls}>
              <TouchableOpacity onPress={() => adjustTotalThreshold(-25)} style={[styles.stepBtn, { borderColor: colors.border }]}> 
                <Text style={{ color: colors.muted }}>-</Text>
              </TouchableOpacity>
              <Text style={{ color: colorScheme === 'dark' ? '#F8FAFF' : '#0F172A', minWidth: 60, textAlign: 'center' }}>{totalThresholdMB} MB</Text>
              <TouchableOpacity onPress={() => adjustTotalThreshold(25)} style={[styles.stepBtn, { borderColor: colors.border }]}> 
                <Text style={{ color: colors.muted }}>+</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>

      <View style={[styles.summaryCard, { borderColor: colors.border, backgroundColor: colors.card }]}> 
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
          <Text style={[styles.summaryTitle, { color: colorScheme === 'dark' ? '#F8FAFF' : '#0F172A' }]}>Top background talkers</Text>
          <Text style={{ color: colors.muted }}>{totalMB ? `${totalMB.toFixed(0)} MB • ${offenders.length} flagged apps` : 'No data yet'}</Text>
        </View>
        {topTalkers.length ? (
          topTalkers.map((item) => (
            <View key={`${item.packageName}-${item.lastTimeUsed}`} style={styles.summaryRow}>
              <View>
                <Text style={[styles.summaryPkg, { color: colorScheme === 'dark' ? '#F8FAFF' : '#0F172A' }]}>{item.packageName}</Text>
                <Text style={{ color: colors.muted, fontSize: 12 }}>Last used: {formatLastUsed(item.lastTimeUsed)}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ color: colors.accent }}>{item.mb.toFixed(1)} MB</Text>
                <Text style={{ color: colors.muted, fontSize: 12 }}>{item.rxMB.toFixed(1)}↓ / {item.txMB.toFixed(1)}↑</Text>
              </View>
            </View>
          ))
        ) : (
          <Text style={{ color: colors.muted }}>No background usage collected yet.</Text>
        )}
      </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { margin: 16, padding: 16, borderRadius: 16, borderWidth: 1, gap: 8 },
  title: { fontSize: 22, fontWeight: '700' },
  sub: { fontSize: 14, lineHeight: 20 },
  centerWrap: { alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  bigButton: { alignItems: 'center', justifyContent: 'center', gap: 10, padding: 10, borderRadius: 200, borderWidth: 1 },
  bigButtonInner: { width: 220, height: 220, borderRadius: 110, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 12, elevation: 6 },
  bigButtonLabel: { color: '#F8FAFF', fontWeight: '800', fontSize: 18, textTransform: 'uppercase', letterSpacing: 1, textAlign: 'center', paddingHorizontal: 12 },
  bigSubLabel: { fontSize: 12, letterSpacing: 1 },
  notice: { marginHorizontal: 16, marginBottom: 12, padding: 12, borderRadius: 12, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  noticeText: { flex: 1, fontSize: 13, marginRight: 12 },
  noticeBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1 },
  settingsCard: { marginHorizontal: 16, marginBottom: 16, borderRadius: 16, borderWidth: 1, padding: 16, gap: 16 },
  settingsTitle: { fontWeight: '700', fontSize: 16 },
  settingsLabel: { fontSize: 13, marginBottom: 6 },
  chipRow: { flexDirection: 'row', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1 },
  stepRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  stepControls: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepBtn: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  summaryCard: { marginHorizontal: 16, marginBottom: 24, borderRadius: 16, borderWidth: 1, padding: 16, gap: 12 },
  summaryTitle: { fontWeight: '700', fontSize: 16 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  summaryPkg: { fontWeight: '600' },
});
