import React, { useEffect, useRef, useState, type ComponentProps } from 'react';
import {
  Alert,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Accelerometer, Gyroscope } from 'expo-sensors';
import * as FileSystem from 'expo-file-system';
import {
  writeAsStringAsync as legacyWriteAsStringAsync,
  readAsStringAsync as legacyReadAsStringAsync,
} from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as Linking from 'expo-linking';
import * as DocumentPicker from 'expo-document-picker';
import * as Clipboard from 'expo-clipboard';
import { Feather } from '@expo/vector-icons';

import { useColorScheme } from '@/hooks/use-color-scheme';

/** Types */
type Sample = {
  t: number;
  ax: number;
  ay: number;
  az: number;
  gx: number;
  gy: number;
  gz: number;
};
type Templates = { [label: string]: Sample[][] };

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type FeatherIcon = ComponentProps<typeof Feather>['name'];

const palette = {
  light: {
    background: '#F5F7FB',
    card: '#FFFFFF',
    border: '#E2E8F0',
    muted: '#636A7A',
    accent: '#2563EB',
    secondary: '#EEF2FF',
    danger: '#DC2626',
    badgeBg: '#DBEAFE',
    badgeText: '#1D4ED8',
    textStrong: '#0F172A',
    field: '#F8FAFF',
  },
  dark: {
    background: '#020817',
    card: '#0B1221',
    border: '#1D2840',
    muted: '#94A3B8',
    accent: '#3B82F6',
    secondary: '#14223B',
    danger: '#F87171',
    badgeBg: '#0F1E38',
    badgeText: '#BFDBFE',
    textStrong: '#F9FAFB',
    field: '#050B18',
  },
} as const;

export default function GestureScreen() {
  const [recording, setRecording] = useState(false);
  const [count, setCount] = useState(0);
  const countRef = useRef(0);
  const accelSub = useRef<any>(null);
  const gyroSub = useRef<any>(null);
  const lastGyro = useRef({ x: 0, y: 0, z: 0 });
  const bufferRef = useRef<Sample[]>([]);
  const [templates, setTemplates] = useState<Templates>({});
  const [labelName, setLabelName] = useState('');
  const [status, setStatus] = useState('idle');
  const [labelStats, setLabelStats] = useState<
    Record<
      string,
      { meanIntra: number; maxIntra: number; exemplarCount: number }
    >
  >({});
  const colorScheme = useColorScheme() ?? 'light';
  const colors = palette[colorScheme];
  const templateEntries = Object.keys(templates);

  useEffect(() => {
    Accelerometer.setUpdateInterval(40);
    Gyroscope.setUpdateInterval(40);
    return () => stopSensors();
  }, []);

  // Throttle UI updates for sample count to keep buttons responsive
  useEffect(() => {
    let id: any;
    if (recording) {
      id = setInterval(() => setCount(countRef.current), 200);
    } else {
      // ensure the last count is reflected when stopping
      setCount(countRef.current);
    }
    return () => id && clearInterval(id);
  }, [recording]);

  function startSensors() {
    if (accelSub.current || gyroSub.current) return; // avoid stacking listeners
    bufferRef.current = [];
    countRef.current = 0;
    setCount(0);
    setRecording(true);
    setStatus('recording...');
    gyroSub.current = Gyroscope.addListener((g) => (lastGyro.current = g));
    accelSub.current = Accelerometer.addListener((a) => {
      const g = lastGyro.current || { x: 0, y: 0, z: 0 };
      const s: Sample = {
        t: Date.now(),
        ax: a.x,
        ay: a.y,
        az: a.z,
        gx: g.x,
        gy: g.y,
        gz: g.z,
      };
      bufferRef.current.push(s);
      countRef.current += 1;
    });
  }

  function stopSensors() {
    // Flip UI state first for instant feedback
    setRecording(false);
    setStatus('idle');
    setCount(countRef.current);
    // Then tear down listeners
    accelSub.current && accelSub.current.remove();
    gyroSub.current && gyroSub.current.remove();
    accelSub.current = null;
    gyroSub.current = null;
  }

  function saveExample() {
    stopSensors();
    const seq = bufferRef.current.slice();
    if (!labelName.trim()) {
      Alert.alert(
        'Label required',
        'Type a label (e.g., maps, whatsapp) before saving.'
      );
      return;
    }
    if (!seq.length) {
      Alert.alert('No data', 'No samples recorded. Record a gesture first.');
      return;
    }
    setTemplates((prev) => {
      const copy = { ...prev };
      if (!copy[labelName]) copy[labelName] = [];
      copy[labelName].push(seq);
      setTimeout(() => computeLabelStats(copy), 0);
      return copy;
    });
    bufferRef.current = [];
    setCount(0);
    Alert.alert('Saved', `Saved example for "${labelName}".`);
  }

  /** Moving average filter */
  function movingAverageFilter(seq: Sample[], n = 3) {
    if (!seq.length || n <= 1) return seq;
    const out: Sample[] = [];
    for (let i = 0; i < seq.length; i++) {
      const start = Math.max(0, i - Math.floor((n - 1) / 2));
      const end = Math.min(seq.length - 1, i + Math.floor(n / 2));
      const window = seq.slice(start, end + 1);
      const avg: any = {
        t: seq[i].t,
        ax: 0,
        ay: 0,
        az: 0,
        gx: 0,
        gy: 0,
        gz: 0,
      };
      for (const s of window) {
        avg.ax += s.ax;
        avg.ay += s.ay;
        avg.az += s.az;
        avg.gx += s.gx;
        avg.gy += s.gy;
        avg.gz += s.gz;
      }
      const denom = window.length;
      avg.ax /= denom;
      avg.ay /= denom;
      avg.az /= denom;
      avg.gx /= denom;
      avg.gy /= denom;
      avg.gz /= denom;
      out.push(avg as Sample);
    }
    return out;
  }

  /** Export templates */
  async function exportTemplates() {
    try {
      const json = JSON.stringify(templates, null, 2);
      const docDirRuntime = (FileSystem as any).documentDirectory;
      const cacheDirRuntime = (FileSystem as any).cacheDirectory;
      const docDir = docDirRuntime ?? cacheDirRuntime ?? null;
      if (!docDir) {
        await Clipboard.setStringAsync(json);
        Alert.alert(
          'No file storage available',
          'Copied JSON to clipboard. Paste into gesture_templates.json on your computer.'
        );
        return;
      }
      const filename = `${docDir}gesture_templates.json`;
      await legacyWriteAsStringAsync(filename, json);
      if (await Sharing.isAvailableAsync())
        await Sharing.shareAsync(filename, {
          dialogTitle: 'Share gesture templates',
        });
      else Alert.alert('Export saved', `Saved to: ${filename}`);
    } catch (err: any) {
      Alert.alert('Export failed', err?.message ?? String(err));
    }
  }

  /** Import from file */
  async function importTemplatesFromFile() {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: 'application/json',
        copyToCacheDirectory: true,
      });
      //@ts-ignore
      if (res.type !== 'success') {
        Alert.alert('Import cancelled');
        return;
      }
      //@ts-ignore
      const text = await legacyReadAsStringAsync(res.uri);
      const parsed = JSON.parse(text);
      setTemplates(parsed as Templates);
      computeLabelStats(parsed);
      Alert.alert(
        'Imported',
        `Loaded labels: ${Object.keys(parsed).join(', ')}`
      );
    } catch (err: any) {
      Alert.alert('Import failed', err?.message ?? String(err));
    }
  }

  /** Import from clipboard */
  async function importFromClipboard() {
    try {
      const txt = await Clipboard.getStringAsync();
      if (!txt) {
        Alert.alert('Clipboard empty');
        return;
      }
      const parsed = JSON.parse(txt);
      setTemplates(parsed as Templates);
      computeLabelStats(parsed);
      Alert.alert(
        'Imported from clipboard',
        `Labels: ${Object.keys(parsed).join(', ')}`
      );
    } catch {
      Alert.alert('Import failed', 'Clipboard did not contain valid JSON.');
    }
  }

  /** Normalization & DTW */
  function normalizeSequence(seq: Sample[]) {
    if (!seq.length) return seq;
    const axes = ['ax', 'ay', 'az', 'gx', 'gy', 'gz'] as const;
    const stats: Record<string, { mean: number; std: number }> = {};
    axes.forEach((k) => {
      const vals = seq.map((s) => (s as any)[k]);
      const mean = vals.reduce((a, b) => a + b, 0) / vals.length || 0;
      let variance =
        vals.map((v) => (v - mean) ** 2).reduce((a, b) => a + b, 0) /
        Math.max(1, vals.length);
      let std = Math.sqrt(variance);
      if (std === 0) std = 1;
      stats[k] = { mean, std };
    });
    return seq.map((s) => {
      const out: any = {};
      axes.forEach((k) => {
        out[k] = ((s as any)[k] - stats[k].mean) / stats[k].std;
      });
      return out as Sample;
    });
  }

  function sampleDistance(a: Sample, b: Sample) {
    const keys: (keyof Sample)[] = ['ax', 'ay', 'az', 'gx', 'gy', 'gz'];
    let sum = 0;
    for (let k of keys) {
      const da = (a as any)[k] || 0;
      const db = (b as any)[k] || 0;
      const d = da - db;
      sum += d * d;
    }
    return Math.sqrt(sum);
  }

  function dtwDistance(seqA: Sample[], seqB: Sample[]) {
    const n = seqA.length,
      m = seqB.length;
    if (n === 0 || m === 0) return Number.POSITIVE_INFINITY;
    const A = normalizeSequence(seqA),
      B = normalizeSequence(seqB);
    const dtw: number[][] = Array.from({ length: n + 1 }, () =>
      new Array(m + 1).fill(Infinity)
    );
    dtw[0][0] = 0;
    for (let i = 1; i <= n; i++)
      for (let j = 1; j <= m; j++) {
        const cost = sampleDistance(A[i - 1], B[j - 1]);
        const minPrev = Math.min(
          dtw[i - 1][j],
          dtw[i][j - 1],
          dtw[i - 1][j - 1]
        );
        dtw[i][j] = cost + minPrev;
      }
    return dtw[n][m] / (n + m);
  }

  /** Stats per label */
  function computeLabelStats(currentTemplates: Templates) {
    const stats: Record<
      string,
      { meanIntra: number; maxIntra: number; exemplarCount: number }
    > = {};
    for (const label of Object.keys(currentTemplates)) {
      const exs = currentTemplates[label];
      const n = exs.length;
      if (n <= 1) {
        stats[label] = { meanIntra: 0, maxIntra: 0, exemplarCount: n };
        continue;
      }
      const pairs: number[] = [];
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          pairs.push(dtwDistance(exs[i], exs[j]));
        }
      }
      const meanIntra = pairs.reduce((a, b) => a + b, 0) / pairs.length;
      const maxIntra = Math.max(...pairs);
      stats[label] = { meanIntra, maxIntra, exemplarCount: n };
    }
    setLabelStats(stats);
  }

  /** Classify with details */
  function classifySequenceWithDetails(seq: Sample[]) {
    const labels = Object.keys(templates);
    if (!labels.length)
      return {
        label: null as string | null,
        score: Infinity,
        details: {} as any,
      };
    const details: Record<
      string,
      { exemplarDistances: number[]; avg: number; min: number }
    > = {};
    let bestLabel: string | null = null;
    let bestScore = Infinity;
    for (const label of labels) {
      const exemplars = templates[label];
      const dists = exemplars.map((ex) => dtwDistance(seq, ex));
      const avg = dists.reduce((a, b) => a + b, 0) / dists.length;
      const min = Math.min(...dists);
      details[label] = { exemplarDistances: dists, avg, min };
      if (avg < bestScore) {
        bestScore = avg;
        bestLabel = label;
      }
    }
    return { label: bestLabel, score: bestScore, details };
  }

  function stopAndClassify() {
    stopSensors();
    const rawSeq = bufferRef.current.slice();
    if (!rawSeq.length) {
      Alert.alert('No data', 'No recorded gesture to classify.');
      return;
    }
    const seq = movingAverageFilter(rawSeq, 3);
    const res = classifySequenceWithDetails(seq);
    bufferRef.current = [];
    setCount(0);
    if (!res.label) {
      Alert.alert('No templates', 'No saved gestures to compare with.');
      return;
    }
    const stats = labelStats[res.label];
    let adaptiveThreshold = 0.6;
    if (stats && stats.exemplarCount >= 2)
      adaptiveThreshold = Math.max(0.3, stats.meanIntra * 1.5);
    const bestMin = res.details[res.label].min;
    const bestAvg = res.details[res.label].avg;
    const msgLines = [
      `Label: ${res.label}`,
      `minDist: ${bestMin.toFixed(3)}`,
      `avgDist: ${bestAvg.toFixed(3)}`,
      `adaptiveTh: ${adaptiveThreshold.toFixed(3)}`,
      `meanIntra: ${stats ? stats.meanIntra.toFixed(3) : 'N/A'}`,
      `maxIntra: ${stats ? stats.maxIntra.toFixed(3) : 'N/A'}`,
      `exemplars: ${stats ? stats.exemplarCount : templates[res.label].length}`,
      '',
      'Per-exemplar distances:',
      res.details[res.label].exemplarDistances
        .map((d: number, i: number) => `#${i + 1}: ${d.toFixed(3)}`)
        .join('\n'),
    ];
    if (bestMin < adaptiveThreshold) {
      Alert.alert('Recognized', msgLines.join('\n'));
      handleActionForLabel(res.label);
    } else {
      Alert.alert('Not confident', msgLines.join('\n'));
    }
  }

  /** Map labels to actions */
  async function handleActionForLabel(label: string) {
    try {
      const l = label.toLowerCase();
      if (l.includes('whatsapp')) {
        const url = 'whatsapp://send?text=Hello';
        if (await Linking.canOpenURL(url)) return Linking.openURL(url);
      }
      if (l.includes('maps') || l === 'm') {
        const url =
          Platform.OS === 'ios' ? 'maps://?q=coffee' : 'geo:0,0?q=coffee';
        return Linking.openURL(url);
      }
      if (l.includes('youtube')) {
        const url = 'vnd.youtube://';
        if (await Linking.canOpenURL(url)) return Linking.openURL(url);
        return Linking.openURL('https://www.youtube.com');
      }
      // X (Twitter)
      if (l === 'x' || l.includes('twitter')) {
        const url = 'twitter://timeline';
        if (await Linking.canOpenURL(url)) return Linking.openURL(url);
        return Linking.openURL('https://x.com');
      }
      // Gmail (compose)
      if (l.includes('gmail') || l.includes('email')) {
        const gmailCompose = 'googlegmail://co';
        if (await Linking.canOpenURL(gmailCompose))
          return Linking.openURL(gmailCompose);
        // Fallback to default email app compose
        return Linking.openURL('mailto:');
      }
      // Amazon (home/search). Use universal link so app opens if installed
      if (l.includes('amazon')) {
        return Linking.openURL('https://www.amazon.com');
      }
      if (l.includes('web') || l.includes('google') || l.includes('browser')) {
        return Linking.openURL('https://www.google.com');
      }
      Alert.alert('Action', `No action mapped for "${label}".`);
    } catch (err: any) {
      Alert.alert('Open failed', err?.message ?? String(err));
    }
  }

  function clearTemplates() {
    setTemplates({});
    setLabelStats({});
  }

  const ActionButton = ({
    label,
    icon,
    variant = 'primary',
    onPress,
    disabled,
    fullWidth,
  }: {
    label: string;
    icon?: FeatherIcon;
    variant?: ButtonVariant;
    onPress: () => void;
    disabled?: boolean;
    fullWidth?: boolean;
  }) => {
    const variantStyle = {
      primary: { backgroundColor: colors.accent, borderColor: colors.accent },
      secondary: {
        backgroundColor: colors.secondary,
        borderColor: colors.border,
      },
      ghost: { backgroundColor: 'transparent', borderColor: colors.border },
      danger: { backgroundColor: colors.danger, borderColor: colors.danger },
    }[variant];

    const textColor = (() => {
      if (variant === 'secondary') return colors.textStrong;
      if (variant === 'ghost') return colors.accent;
      return '#F8FAFF';
    })();

    return (
      <TouchableOpacity
        activeOpacity={0.85}
        disabled={disabled}
        onPress={onPress}
        pressRetentionOffset={{ top: 20, bottom: 20, left: 20, right: 20 }}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        style={[
          styles.buttonBase,
          variantStyle,
          fullWidth && styles.buttonFullWidth,
          disabled && styles.buttonDisabled,
        ]}
      >
        <View style={styles.buttonContent}>
          {icon && <Feather name={icon} size={16} color={textColor} />}
          <Text style={[styles.buttonLabel, { color: textColor }]}>
            {label}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View
          style={[
            styles.card,
            styles.heroCard,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <View style={styles.heroHeader}>
            <Text style={[styles.heroTitle, { color: colors.textStrong }]}>
              Air Gesture Recorder
            </Text>
            <View style={[styles.badge, { backgroundColor: colors.badgeBg }]}>
              <Feather name="rss" size={14} color={colors.badgeText} />
              <Text style={[styles.badgeText, { color: colors.badgeText }]}>
                {status}
              </Text>
            </View>
          </View>
          <Text style={[styles.heroCopy, { color: colors.muted }]}>
            Capture sensor sequences, label them with the automation you want to
            run, then export the entire library as JSON.
          </Text>
          <View style={styles.metricsRow}>
            {[
              {
                label: 'Samples',
                value: String(count),
                caption: 'current buffer',
              },
              {
                label: 'Templates',
                value: String(templateEntries.length),
                caption: 'labels saved',
              },
              {
                label: 'Recorder',
                value: recording ? 'Live' : 'Idle',
                caption: status,
              },
            ].map((metric) => (
              <View
                key={metric.label}
                style={[styles.metricCard, { borderColor: colors.border }]}
              >
                <Text
                  style={[styles.metricValue, { color: colors.textStrong }]}
                >
                  {metric.value}
                </Text>
                <Text style={[styles.metricLabel, { color: colors.muted }]}>
                  {metric.label}
                </Text>
                <Text style={[styles.metricCaption, { color: colors.muted }]}>
                  {metric.caption}
                </Text>
              </View>
            ))}
          </View>
          <View style={styles.heroActions}>
            <ActionButton
              label={recording ? 'Stop capture' : 'Start capture'}
              icon={recording ? 'pause-circle' : 'play-circle'}
              onPress={recording ? stopSensors : startSensors}
            />
            <ActionButton
              label={recording ? 'Stop & classify' : 'Start then classify'}
              icon={recording ? 'check-circle' : 'repeat'}
              variant="ghost"
              onPress={() => {
                if (!recording) startSensors();
                else stopAndClassify();
              }}
            />
          </View>
        </View>

        <View
          style={[
            styles.card,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.sectionTitle, { color: colors.textStrong }]}>
            Label composer
          </Text>
          <Text style={[styles.sectionCopy, { color: colors.muted }]}>
            Name gestures after the action they unlock. Keep it human: maps,
            studio lights, reply.
          </Text>
          <TextInput
            placeholder="Label name (e.g., maps, x, gmail)"
            placeholderTextColor={colors.muted}
            value={labelName}
            onChangeText={setLabelName}
            autoCapitalize="none"
            style={[
              styles.input,
              {
                borderColor: colors.border,
                backgroundColor: colors.field,
                color: colors.textStrong,
              },
            ]}
          />
          <ActionButton
            label="Save exemplar"
            icon="save"
            variant="secondary"
            onPress={saveExample}
          />
        </View>

        <View
          style={[
            styles.card,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.sectionTitle, { color: colors.textStrong }]}>
            Data studio
          </Text>
          <Text style={[styles.sectionCopy, { color: colors.muted }]}>
            Sync your library with the outside world. Export before
            reinstalling, import to stay aligned across devices.
          </Text>
          <View style={styles.toolGrid}>
            <ActionButton
              label="Export JSON"
              icon="upload"
              variant="ghost"
              fullWidth
              onPress={exportTemplates}
            />
            <ActionButton
              label="Import file"
              icon="download"
              variant="ghost"
              fullWidth
              onPress={importTemplatesFromFile}
            />
            <ActionButton
              label="Paste JSON"
              icon="clipboard"
              variant="ghost"
              fullWidth
              onPress={importFromClipboard}
            />
          </View>
        </View>

        <View
          style={[
            styles.card,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <View style={styles.libraryHeader}>
            <Text style={[styles.sectionTitle, { color: colors.textStrong }]}>
              Gesture library
            </Text>
            <View style={[styles.badge, { backgroundColor: colors.badgeBg }]}>
              <Feather name="layers" size={14} color={colors.badgeText} />
              <Text style={[styles.badgeText, { color: colors.badgeText }]}>
                {templateEntries.length} labels
              </Text>
            </View>
          </View>
          {templateEntries.length ? (
            <View style={styles.libraryList}>
              {templateEntries.map((label) => {
                const stats = labelStats[label];
                return (
                  <View
                    key={label}
                    style={[
                      styles.templateCard,
                      { borderColor: colors.border },
                    ]}
                  >
                    <View style={styles.templateHeader}>
                      <Text
                        style={[
                          styles.templateTitle,
                          { color: colors.textStrong },
                        ]}
                      >
                        {label}
                      </Text>
                      <Text
                        style={[styles.templateBadge, { color: colors.muted }]}
                      >
                        {templates[label].length} examples
                      </Text>
                    </View>
                    {stats ? (
                      <View style={styles.templateStatsRow}>
                        <View style={styles.templateStat}>
                          <Text
                            style={[styles.statLabel, { color: colors.muted }]}
                          >
                            mean intra
                          </Text>
                          <Text
                            style={[
                              styles.statValue,
                              { color: colors.textStrong },
                            ]}
                          >
                            {stats.meanIntra.toFixed(3)}
                          </Text>
                        </View>
                        <View style={styles.templateStat}>
                          <Text
                            style={[styles.statLabel, { color: colors.muted }]}
                          >
                            max intra
                          </Text>
                          <Text
                            style={[
                              styles.statValue,
                              { color: colors.textStrong },
                            ]}
                          >
                            {stats.maxIntra.toFixed(3)}
                          </Text>
                        </View>
                        <View style={styles.templateStat}>
                          <Text
                            style={[styles.statLabel, { color: colors.muted }]}
                          >
                            samples
                          </Text>
                          <Text
                            style={[
                              styles.statValue,
                              { color: colors.textStrong },
                            ]}
                          >
                            {stats.exemplarCount}
                          </Text>
                        </View>
                      </View>
                    ) : (
                      <Text style={[styles.statLabel, { color: colors.muted }]}>
                        Add at least two exemplars to unlock stats.
                      </Text>
                    )}
                  </View>
                );
              })}
            </View>
          ) : (
            <Text style={[styles.emptyState, { color: colors.muted }]}>
              No templates saved yet. Capture a gesture, give it a label, and it
              will show up here.
            </Text>
          )}
          <ActionButton
            label="Clear library"
            icon="trash-2"
            variant="danger"
            fullWidth
            onPress={() => {
              Alert.alert(
                'Clear templates?',
                'This will delete all saved examples.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Yes', onPress: clearTemplates },
                ]
              );
            }}
            disabled={!templateEntries.length}
          />
        </View>

        <Text style={[styles.footerStatus, { color: colors.muted }]}>
          Status: {status}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  scrollContent: {
    padding: 18,
    gap: 18,
  },
  card: {
    borderWidth: 1,
    borderRadius: 24,
    padding: 20,
    gap: 16,
  },
  heroCard: {
    gap: 20,
  },
  heroHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: '700',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  badgeText: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  heroCopy: {
    fontSize: 15,
    lineHeight: 22,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 12,
    flexWrap: 'wrap',
  },
  metricCard: {
    flex: 1,
    minWidth: 110,
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
    gap: 4,
  },
  metricValue: {
    fontSize: 22,
    fontWeight: '600',
  },
  metricLabel: {
    textTransform: 'uppercase',
    fontSize: 11,
    letterSpacing: 1,
  },
  metricCaption: {
    fontSize: 12,
  },
  heroActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  sectionCopy: {
    fontSize: 14,
    lineHeight: 20,
  },
  input: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
  },
  toolGrid: {
    gap: 10,
  },
  libraryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  libraryList: {
    gap: 12,
  },
  templateCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
    gap: 12,
  },
  templateHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  templateTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  templateBadge: {
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  templateStatsRow: {
    flexDirection: 'row',
    gap: 12,
    flexWrap: 'wrap',
  },
  templateStat: {
    flex: 1,
    minWidth: 90,
    gap: 2,
  },
  statLabel: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  statValue: {
    fontSize: 16,
    fontWeight: '600',
  },
  emptyState: {
    fontSize: 14,
    lineHeight: 20,
  },
  footerStatus: {
    textAlign: 'center',
    marginBottom: 32,
    fontSize: 13,
  },
  buttonBase: {
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  buttonContent: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  buttonLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  buttonFullWidth: {
    width: '100%',
  },
  buttonDisabled: {
    opacity: 0.45,
  },
});
