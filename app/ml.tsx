import React, { useEffect, useMemo, useRef, useState, type ComponentProps } from 'react';
import {
  Alert,
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
import * as DocumentPicker from 'expo-document-picker';
import * as Clipboard from 'expo-clipboard';
import { Feather } from '@expo/vector-icons';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { openAppForLabel } from '@/modules/label-actions';
import {
  type GestureDataset,
  type GestureModel,
  type SensorSample,
  extractFeatureVector,
  movingAverage,
  predictFromModel,
  trainSoftmaxModel,
  evaluateSoftmaxOnDataset,
} from '@/modules/gesture-ml';

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

const initialDataset: GestureDataset = { featureNames: [], entries: [] };

function getRuntimeDatasetPath() {
  const docDirRuntime = (FileSystem as any).documentDirectory;
  const cacheDirRuntime = (FileSystem as any).cacheDirectory;
  const dir = docDirRuntime ?? cacheDirRuntime ?? null;
  if (!dir) return null;
  return `${dir}gesture_ml_dataset.runtime.json`;
}

export default function MLGestureScreen() {
  const [recording, setRecording] = useState(false);
  const [count, setCount] = useState(0);
  const countRef = useRef(0);
  const accelSub = useRef<any>(null);
  const gyroSub = useRef<any>(null);
  const lastGyro = useRef({ x: 0, y: 0, z: 0 });
  const bufferRef = useRef<SensorSample[]>([]);
  const [labelName, setLabelName] = useState('');
  const [dataset, setDataset] = useState<GestureDataset>(initialDataset);
  const [dtwTemplates, setDtwTemplates] = useState<Record<string, SensorSample[][]>>({});
  const [model, setModel] = useState<GestureModel | null>(null);
  const [training, setTraining] = useState(false);
  const [status, setStatus] = useState('idle');
  const colorScheme = useColorScheme() ?? 'light';
  const colors = palette[colorScheme];

  useEffect(() => {
    Accelerometer.setUpdateInterval(40);
    Gyroscope.setUpdateInterval(40);
    // Hydrate dataset from disk if available
    (async () => {
      const path = getRuntimeDatasetPath();
      if (!path) return;
      try {
        const info = await FileSystem.getInfoAsync(path);
        if (!info.exists) return;
        const text = await legacyReadAsStringAsync(path);
        const parsed = JSON.parse(text) as GestureDataset;
        if (parsed && Array.isArray(parsed.entries)) {
          setDataset(parsed);
        }
      } catch {
        // ignore hydration errors and start fresh
      }
    })();
    return () => stopSensors();
  }, []);

  useEffect(() => {
    let id: any;
    if (recording) {
      id = setInterval(() => setCount(countRef.current), 200);
    } else {
      setCount(countRef.current);
    }
    return () => id && clearInterval(id);
  }, [recording]);

  // Persist dataset so it survives navigation / reloads until explicitly cleared.
  useEffect(() => {
    const path = getRuntimeDatasetPath();
    if (!path) return;
    (async () => {
      try {
        const json = JSON.stringify(dataset);
        await legacyWriteAsStringAsync(path, json);
      } catch {
        // best-effort; ignore persistence errors
      }
    })();
  }, [dataset]);

  const labelSummary = useMemo(() => {
    const stats: Record<
      string,
      { count: number; avgDuration: number; avgSamples: number }
    > = {};
    dataset.entries.forEach((entry) => {
      if (!stats[entry.label]) {
        stats[entry.label] = { count: 0, avgDuration: 0, avgSamples: 0 };
      }
      const curr = stats[entry.label];
      curr.count += 1;
      curr.avgDuration += entry.durationMs;
      curr.avgSamples += entry.sampleCount;
    });
    Object.keys(stats).forEach((label) => {
      stats[label].avgDuration /= stats[label].count;
      stats[label].avgSamples /= stats[label].count;
    });
    return stats;
  }, [dataset.entries]);

  const hasPendingGesture = bufferRef.current.length > 0;
  const datasetSize = dataset.entries.length;

  function startSensors() {
    if (accelSub.current || gyroSub.current) return;
    bufferRef.current = [];
    countRef.current = 0;
    setCount(0);
    setRecording(true);
    setStatus('recording');
    gyroSub.current = Gyroscope.addListener((g) => (lastGyro.current = g));
    accelSub.current = Accelerometer.addListener((a) => {
      const g = lastGyro.current || { x: 0, y: 0, z: 0 };
      const sample: SensorSample = {
        t: Date.now(),
        ax: a.x,
        ay: a.y,
        az: a.z,
        gx: g.x,
        gy: g.y,
        gz: g.z,
      };
      bufferRef.current.push(sample);
      countRef.current += 1;
    });
  }

  function stopSensors() {
    setRecording(false);
    setStatus('idle');
    setCount(countRef.current);
    accelSub.current && accelSub.current.remove();
    gyroSub.current && gyroSub.current.remove();
    accelSub.current = null;
    gyroSub.current = null;
  }

  function resetBuffer() {
    bufferRef.current = [];
    countRef.current = 0;
    setCount(0);
  }

  // DTW helpers reuse the same axes as the recorder screen.
  function normalizeSequenceDtw(seq: SensorSample[]) {
    if (!seq.length) return seq;
    const axes = ['ax', 'ay', 'az', 'gx', 'gy', 'gz'] as const;
    const stats: Record<string, { mean: number; std: number }> = {};
    axes.forEach((k) => {
      const vals = seq.map((s) => (s as any)[k] as number);
      const mean = vals.reduce((a, b) => a + b, 0) / (vals.length || 1);
      const variance =
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
      return out as SensorSample;
    });
  }

  function sampleDistanceDtw(a: SensorSample, b: SensorSample) {
    const keys: (keyof SensorSample)[] = ['ax', 'ay', 'az', 'gx', 'gy', 'gz'];
    let sum = 0;
    keys.forEach((k) => {
      const da = (a as any)[k] || 0;
      const db = (b as any)[k] || 0;
      const d = da - db;
      sum += d * d;
    });
    return Math.sqrt(sum);
  }

  function dtwDistance(seqA: SensorSample[], seqB: SensorSample[]) {
    const n = seqA.length;
    const m = seqB.length;
    if (n === 0 || m === 0) return Number.POSITIVE_INFINITY;
    const A = normalizeSequenceDtw(seqA);
    const B = normalizeSequenceDtw(seqB);
    const dtw: number[][] = Array.from({ length: n + 1 }, () =>
      new Array(m + 1).fill(Infinity)
    );
    dtw[0][0] = 0;
    for (let i = 1; i <= n; i++) {
      for (let j = 1; j <= m; j++) {
        const cost = sampleDistanceDtw(A[i - 1], B[j - 1]);
        const minPrev = Math.min(dtw[i - 1][j], dtw[i][j - 1], dtw[i - 1][j - 1]);
        dtw[i][j] = cost + minPrev;
      }
    }
    return dtw[n][m] / (n + m);
  }

  function ensureFeatureLayout(incomingNames: string[]) {
    if (!dataset.featureNames.length) return incomingNames;
    const matches =
      dataset.featureNames.length === incomingNames.length &&
      dataset.featureNames.every((name, idx) => name === incomingNames[idx]);
    if (!matches) {
      throw new Error('Feature layout mismatch. Clear dataset before mixing formats.');
    }
    return dataset.featureNames;
  }

  function saveGestureExample() {
    stopSensors();
    const trimmed = labelName.trim();
    if (!trimmed) {
      Alert.alert('Label required', 'Type a label before saving.');
      return;
    }
    if (!bufferRef.current.length) {
      Alert.alert('No gesture', 'Record a gesture first.');
      return;
    }
    try {
      const filtered = movingAverage(bufferRef.current, 3);
      const features = extractFeatureVector(filtered);
      ensureFeatureLayout(features.featureNames);
      const entry = {
        id: `sample-${Date.now()}`,
        label: trimmed,
        values: features.values,
        durationMs: features.durationMs,
        sampleCount: features.sampleCount,
      };
      setDataset((prev) => ({
        featureNames: prev.featureNames.length ? prev.featureNames : features.featureNames,
        entries: [...prev.entries, entry],
      }));
      // Also track full filtered sequences per label for DTW baseline.
      setDtwTemplates((prev) => {
        const next = { ...prev };
        if (!next[trimmed]) next[trimmed] = [];
        next[trimmed].push(filtered);
        return next;
      });
      resetBuffer();
      Alert.alert('Saved', `Added training example for "${trimmed}".`);
    } catch (err: any) {
      Alert.alert('Save failed', err?.message ?? String(err));
    }
  }

  function clearDataset() {
    Alert.alert('Clear dataset?', 'This removes all collected samples.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: () => {
          setDataset(initialDataset);
          setModel(null);
          setDtwTemplates({});
        },
      },
    ]);
  }

  function clearModel() {
    setModel(null);
  }

  function evaluateAccuracy() {
    if (!dataset.entries.length) {
      Alert.alert('Dataset empty', 'Collect samples before evaluating accuracy.');
      return;
    }
    try {
      const { result } = evaluateSoftmaxOnDataset(dataset, {
        testFraction: 0.2,
        epochs: 250,
        learningRate: 0.08,
      });
      const overallPct = (result.overallAccuracy * 100).toFixed(1);
      const lines = [
        `Overall accuracy: ${overallPct}%`,
        `Test samples: ${result.totalSamples}`,
        '',
        'Per-label:',
        ...Object.entries(result.perLabel).map(([label, stats]) =>
          `${label}: ${(stats.accuracy * 100).toFixed(1)}% (${stats.correct}/${stats.total})`
        ),
      ];
      Alert.alert('Offline accuracy', lines.join('\n'));
    } catch (err: any) {
      Alert.alert('Evaluation failed', err?.message ?? String(err));
    }
  }

  function trainModelOnDevice() {
    if (!dataset.entries.length) {
      Alert.alert('Dataset empty', 'Collect data before training.');
      return;
    }
    setTraining(true);
    setTimeout(() => {
      try {
        const trained = trainSoftmaxModel(dataset, { epochs: 250, learningRate: 0.08 });
        setModel(trained);
        Alert.alert('Model trained', `Labels: ${trained.labels.join(', ')}`);
      } catch (err: any) {
        Alert.alert('Training failed', err?.message ?? String(err));
      } finally {
        setTraining(false);
      }
    }, 16);
  }

  function predictGesture() {
    stopSensors();
    if (!bufferRef.current.length) {
      Alert.alert('No gesture', 'Record a gesture to classify.');
      return;
    }
    if (!model) {
      Alert.alert('Model missing', 'Train or import an ML model first.');
      return;
    }
    try {
      const t0 = Date.now();
      const filtered = movingAverage(bufferRef.current, 3);
      const features = extractFeatureVector(filtered);
      if (features.featureNames.length !== model.featureNames.length) {
        throw new Error('Model feature layout does not match current extraction.');
      }
      const prediction = predictFromModel(model, features.values);
      const latencyMs = Date.now() - t0;
      resetBuffer();
      const top = prediction.distribution[0];
      const second = prediction.distribution[1];
      const summary = [
        `Prediction: ${top.label}`,
        `Confidence: ${(top.confidence * 100).toFixed(1)}%`,
        `Latency: ${latencyMs} ms`,
        second ? `Runner-up: ${second.label} (${(second.confidence * 100).toFixed(1)}%)` : '',
      ]
        .filter(Boolean)
        .join('\n');
      Alert.alert('Prediction', summary);
      if (top.confidence >= 0.55) {
        openAppForLabel(top.label);
      }
    } catch (err: any) {
      Alert.alert('Prediction failed', err?.message ?? String(err));
    }
  }

  function predictGestureBaseline() {
    stopSensors();
    if (!bufferRef.current.length) {
      Alert.alert('No gesture', 'Record a gesture to classify.');
      return;
    }
    if (!Object.keys(dtwTemplates).length) {
      Alert.alert('No DTW templates', 'Save at least one example per label before running the baseline.');
      return;
    }
    try {
      const t0 = Date.now();
      const filtered = movingAverage(bufferRef.current, 3);
      // DTW baseline: compare this sequence against all stored sequences per label.
      const labels = Object.keys(dtwTemplates);
      const avgDistances: Record<string, number> = {};
      labels.forEach((label) => {
        const exemplars = dtwTemplates[label];
        if (!exemplars || !exemplars.length) return;
        const dists = exemplars.map((seq) => dtwDistance(filtered, seq));
        const avg = dists.reduce((a, b) => a + b, 0) / dists.length;
        avgDistances[label] = avg;
      });
      const entries = Object.entries(avgDistances);
      if (!entries.length) {
        throw new Error('No valid DTW exemplars to compare against.');
      }
      const weights = entries.map(([label, avg]) => ({ label, weight: Math.exp(-avg) }));
      const total = weights.reduce((sum, w) => sum + w.weight, 0) || 1;
      const distribution = weights
        .map((w) => ({ label: w.label, confidence: w.weight / total }))
        .sort((a, b) => b.confidence - a.confidence);
      const top = distribution[0];
      const second = distribution[1];
      const latencyMs = Date.now() - t0;
      resetBuffer();
      const summary = [
        `Baseline (DTW) prediction: ${top.label}`,
        `Confidence (DTW-based): ${(top.confidence * 100).toFixed(1)}%`,
        `Latency: ${latencyMs} ms`,
        second ? `Runner-up: ${second.label} (${(second.confidence * 100).toFixed(1)}%)` : '',
      ]
        .filter(Boolean)
        .join('\n');
      Alert.alert('Baseline prediction', summary);
    } catch (err: any) {
      Alert.alert('Baseline failed', err?.message ?? String(err));
    }
  }

  async function exportDataset() {
    if (!dataset.entries.length) {
      Alert.alert('Nothing to export', 'Collect some samples first.');
      return;
    }
    try {
      const json = JSON.stringify(dataset, null, 2);
      const docDirRuntime = (FileSystem as any).documentDirectory;
      const cacheDirRuntime = (FileSystem as any).cacheDirectory;
      const docDir = docDirRuntime ?? cacheDirRuntime ?? null;
      if (!docDir) {
        await Clipboard.setStringAsync(json);
        Alert.alert('Copied JSON', 'Storage unavailable. Dataset copied to clipboard.');
        return;
      }
      const filename = `${docDir}gesture_ml_dataset.json`;
      await legacyWriteAsStringAsync(filename, json);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(filename, { dialogTitle: 'Share ML dataset' });
      } else {
        Alert.alert('Export complete', `Saved to ${filename}`);
      }
    } catch (err: any) {
      Alert.alert('Export failed', err?.message ?? String(err));
    }
  }

  async function importDataset() {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: 'application/json', copyToCacheDirectory: true });
      //@ts-ignore
      if (res.type !== 'success') {
        Alert.alert('Import cancelled');
        return;
      }
      //@ts-ignore
      const txt = await legacyReadAsStringAsync(res.uri);
      const parsed = JSON.parse(txt);
      if (!parsed.featureNames || !Array.isArray(parsed.entries)) {
        throw new Error('File missing featureNames or entries.');
      }
      setDataset(parsed as GestureDataset);
      Alert.alert('Dataset loaded', `${parsed.entries.length} samples ready.`);
    } catch (err: any) {
      Alert.alert('Import failed', err?.message ?? String(err));
    }
  }

  async function exportModel() {
    if (!model) {
      Alert.alert('No model', 'Train or import a model first.');
      return;
    }
    try {
      const json = JSON.stringify(model, null, 2);
      const docDirRuntime = (FileSystem as any).documentDirectory;
      const cacheDirRuntime = (FileSystem as any).cacheDirectory;
      const docDir = docDirRuntime ?? cacheDirRuntime ?? null;
      if (!docDir) {
        await Clipboard.setStringAsync(json);
        Alert.alert('Copied JSON', 'Storage unavailable. Model copied to clipboard.');
        return;
      }
      const filename = `${docDir}gesture_ml_model.json`;
      await legacyWriteAsStringAsync(filename, json);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(filename, { dialogTitle: 'Share ML model' });
      } else {
        Alert.alert('Export complete', `Saved to ${filename}`);
      }
    } catch (err: any) {
      Alert.alert('Export failed', err?.message ?? String(err));
    }
  }

  async function importModel() {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: 'application/json', copyToCacheDirectory: true });
      //@ts-ignore
      if (res.type !== 'success') {
        Alert.alert('Import cancelled');
        return;
      }
      //@ts-ignore
      const txt = await legacyReadAsStringAsync(res.uri);
      const parsed = JSON.parse(txt) as GestureModel;
      if (!parsed.featureNames || !parsed.labels || !parsed.weights) {
        throw new Error('Invalid model payload');
      }
      setModel(parsed);
      Alert.alert('Model ready', `Loaded labels: ${parsed.labels.join(', ')}`);
    } catch (err: any) {
      Alert.alert('Import failed', err?.message ?? String(err));
    }
  }

  const ActionButton = ({
    label,
    icon,
    onPress,
    variant = 'primary',
    disabled,
    fullWidth,
  }: {
    label: string;
    icon?: FeatherIcon;
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
    onPress: () => void | Promise<void>;
    disabled?: boolean;
    fullWidth?: boolean;
  }) => {
    const palette = {
      primary: { backgroundColor: colors.accent, borderColor: colors.accent },
      secondary: { backgroundColor: colors.secondary, borderColor: colors.border },
      ghost: { backgroundColor: 'transparent', borderColor: colors.border },
      danger: { backgroundColor: colors.danger, borderColor: colors.danger },
    }[variant];
    const textColor = variant === 'secondary' ? colors.textStrong : variant === 'ghost' ? colors.accent : '#F8FAFF';
    return (
      <TouchableOpacity
        activeOpacity={0.85}
        disabled={disabled}
        onPress={onPress}
        style={[
          styles.actionButton,
          palette,
          disabled && { opacity: 0.5 },
          fullWidth && { flexBasis: '100%' },
        ]}
      >
        {icon && <Feather name={icon} size={16} color={textColor} style={{ marginRight: 8 }} />}
        <Text style={[styles.actionButtonText, { color: textColor }]}>{label}</Text>
      </TouchableOpacity>
    );
  };

  const modelStatus = model
    ? `Trained on ${model.trainingSamples} samples · ${model.labels.length} labels`
    : 'No model yet';

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={[styles.container, { backgroundColor: colors.background }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}> 
          <Text style={[styles.title, { color: colors.textStrong }]}>ML launcher</Text>
          <Text style={[styles.subtitle, { color: colors.muted }]}>Collect labeled IMU bursts, train a softmax model, and map gestures directly to app launches.</Text>
          <View style={styles.statusRow}>
            <Badge icon="database" label={`${datasetSize} samples`} colors={colors} />
            <Badge icon="cpu" label={model ? 'Model ready' : 'Model missing'} colors={colors} />
            <Badge icon="circle" label={status} colors={colors} />
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}> 
          <Text style={[styles.sectionTitle, { color: colors.textStrong }]}>Capture controls</Text>
          <Text style={[styles.paragraph, { color: colors.muted }]}>Give the gesture a label, capture ~2 seconds of motion, and either add it to the ML dataset or run a prediction.</Text>
          <TextInput
            placeholder="maps, whatsapp, etc"
            placeholderTextColor={colors.muted}
            style={[styles.input, { backgroundColor: colors.field, color: colors.textStrong, borderColor: colors.border }]}
            value={labelName}
            onChangeText={setLabelName}
          />
          <Text style={[styles.counter, { color: colors.muted }]}>Samples captured: {count}</Text>
          <View style={styles.toolGrid}>
            <ActionButton
              label={recording ? 'Stop recording' : 'Record gesture'}
              icon={recording ? 'stop-circle' : 'play-circle'}
              variant="primary"
              onPress={recording ? stopSensors : startSensors}
            />
            <ActionButton
              label="Save to dataset"
              icon="save"
              variant="secondary"
              disabled={!hasPendingGesture}
              onPress={saveGestureExample}
            />
            <ActionButton
              label="Predict & open app"
              icon="navigation-2"
              variant="ghost"
              disabled={!hasPendingGesture || !model}
              onPress={predictGesture}
              fullWidth
            />
            <ActionButton
              label="Baseline (DTW) predict"
              icon="trending-up"
              variant="ghost"
              disabled={!hasPendingGesture || !Object.keys(dtwTemplates).length}
              onPress={predictGestureBaseline}
              fullWidth
            />
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}> 
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.textStrong }]}>Dataset health</Text>
            <Badge icon="layers" label={`${Object.keys(labelSummary).length} labels`} colors={colors} />
          </View>
          {Object.keys(labelSummary).length ? (
            <View style={styles.datasetList}>
              {Object.entries(labelSummary).map(([label, info]) => (
                <View key={label} style={[styles.datasetRow, { borderColor: colors.border }]}> 
                  <View>
                    <Text style={[styles.rowTitle, { color: colors.textStrong }]}>{label}</Text>
                    <Text style={[styles.rowCaption, { color: colors.muted }]}>
                      {info.count} samples · {info.avgSamples.toFixed(0)} pts · {(info.avgDuration / 1000).toFixed(2)}s
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <Text style={[styles.paragraph, { color: colors.muted }]}>No samples yet. Collect at least 10 per label for stable training.</Text>
          )}
          <View style={styles.toolGrid}>
            <ActionButton label="Export dataset" icon="upload" variant="ghost" onPress={exportDataset} />
            <ActionButton label="Import dataset" icon="download" variant="ghost" onPress={importDataset} />
            <ActionButton label="Copy JSON" icon="clipboard" variant="ghost" onPress={async () => {
              await Clipboard.setStringAsync(JSON.stringify(dataset, null, 2));
              Alert.alert('Copied', 'Dataset JSON copied to clipboard.');
            }} />
            <ActionButton
              label="Evaluate accuracy"
              icon="bar-chart-2"
              variant="ghost"
              disabled={!dataset.entries.length}
              onPress={evaluateAccuracy}
            />
            <ActionButton label="Clear dataset" icon="trash" variant="danger" onPress={clearDataset} />
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}> 
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.textStrong }]}>Model</Text>
            <Text style={[styles.rowCaption, { color: colors.muted }]}>{modelStatus}</Text>
          </View>
          {model && (
            <View style={styles.modelStats}>
              <View>
                <Text style={[styles.rowTitle, { color: colors.textStrong }]}>Loss trend</Text>
                <Text style={[styles.rowCaption, { color: colors.muted }]}>Final loss {(model.lossHistory[model.lossHistory.length - 1] ?? 0).toFixed(4)}</Text>
              </View>
              <Text style={[styles.rowCaption, { color: colors.muted }]}>Trained {(new Date(model.trainedAt)).toLocaleString()}</Text>
            </View>
          )}
          <View style={styles.toolGrid}>
            <ActionButton
              label={training ? 'Training…' : 'Train model'}
              icon="cpu"
              variant="primary"
              onPress={trainModelOnDevice}
              disabled={training || dataset.entries.length < 2}
            />
            <ActionButton label="Export model" icon="upload" variant="secondary" onPress={exportModel} />
            <ActionButton label="Import model" icon="download" variant="secondary" onPress={importModel} />
            <ActionButton label="Clear model" icon="x-circle" variant="ghost" onPress={clearModel} />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const Badge = ({ icon, label, colors }: { icon: FeatherIcon; label: string; colors: (typeof palette)['light'] }) => (
  <View style={[styles.badge, { backgroundColor: colors.badgeBg }]}> 
    <Feather name={icon} size={14} color={colors.badgeText} />
    <Text style={[styles.badgeText, { color: colors.badgeText }]}>{label}</Text>
  </View>
);

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  container: {
    padding: 20,
    gap: 16,
  },
  card: {
    borderWidth: 1,
    borderRadius: 24,
    padding: 20,
    gap: 14,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 6,
  },
  badgeText: {
    fontSize: 13,
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
  },
  counter: {
    fontSize: 13,
  },
  toolGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  actionButton: {
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionButtonText: {
    fontWeight: '600',
  },
  paragraph: {
    fontSize: 14,
    lineHeight: 20,
  },
  datasetList: {
    gap: 12,
  },
  datasetRow: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
  },
  rowTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  rowCaption: {
    fontSize: 13,
  },
  modelStats: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    gap: 6,
  },
});
