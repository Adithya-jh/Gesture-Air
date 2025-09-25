// app/gesture.tsx
import React, { useEffect, useRef, useState } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  Button,
  TextInput,
  StyleSheet,
  FlatList,
  Alert,
  Platform,
} from 'react-native';
import { Accelerometer, Gyroscope } from 'expo-sensors';
import * as FileSystem from 'expo-file-system';
// legacy read/write for Expo Go compatibility
import {
  writeAsStringAsync as legacyWriteAsStringAsync,
  readAsStringAsync as legacyReadAsStringAsync,
} from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as Linking from 'expo-linking';
import * as DocumentPicker from 'expo-document-picker';
import * as Clipboard from 'expo-clipboard';

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

export default function GestureScreen() {
  const [recording, setRecording] = useState(false);
  const [count, setCount] = useState(0);
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

  useEffect(() => {
    Accelerometer.setUpdateInterval(40);
    Gyroscope.setUpdateInterval(40);
    return () => stopSensors();
  }, []);

  function startSensors() {
    bufferRef.current = [];
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
      setCount((c) => c + 1);
    });
  }

  function stopSensors() {
    accelSub.current && accelSub.current.remove();
    gyroSub.current && gyroSub.current.remove();
    accelSub.current = null;
    gyroSub.current = null;
    setRecording(false);
    setStatus('idle');
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

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Air Gesture Launcher</Text>
      <View style={styles.row}>
        <Button
          title={recording ? 'Stop Recording' : 'Start Recording'}
          onPress={recording ? stopSensors : startSensors}
        />
        <Text style={styles.counter}>{count} samples</Text>
      </View>
      <View style={{ marginTop: 12, width: '100%', alignItems: 'center' }}>
        <TextInput
          placeholder="Label name (e.g., maps, whatsapp)"
          value={labelName}
          onChangeText={setLabelName}
          style={styles.input}
        />
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
          <Button title="Save example" onPress={saveExample} />
          <Button title="Export" onPress={exportTemplates} />
        </View>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
          <Button
            title="Import JSON (file)"
            onPress={importTemplatesFromFile}
          />
          <Button title="Import from clipboard" onPress={importFromClipboard} />
        </View>
      </View>
      <View style={{ marginTop: 12, width: '100%', alignItems: 'center' }}>
        <Button
          title="Start then Stop & Classify"
          onPress={() => {
            if (!recording) startSensors();
            else stopAndClassify();
          }}
        />
      </View>
      <View style={{ marginTop: 16, width: '100%' }}>
        <Text style={{ fontWeight: '600' }}>Saved templates:</Text>
        <FlatList
          data={Object.keys(templates)}
          keyExtractor={(k) => k}
          renderItem={({ item }) => (
            <View style={styles.templateRow}>
              <Text>
                {item} — {templates[item].length} examples
              </Text>
            </View>
          )}
          ListEmptyComponent={<Text>No templates saved yet.</Text>}
        />
        <View style={{ marginTop: 8 }}>
          <Button
            title="Clear templates"
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
          />
        </View>
      </View>
      <Text style={{ marginTop: 12, color: '#666' }}>Status: {status}</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 18, alignItems: 'center' },
  title: { fontSize: 20, fontWeight: '700', marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center' },
  counter: { marginLeft: 12 },
  input: {
    width: 340,
    borderWidth: 1,
    borderColor: '#ccc',
    padding: 8,
    borderRadius: 6,
    marginTop: 6,
  },
  templateRow: { paddingVertical: 6 },
});
