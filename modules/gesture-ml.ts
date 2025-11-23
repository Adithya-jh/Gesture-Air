export type SensorSample = {
  t: number;
  ax: number;
  ay: number;
  az: number;
  gx: number;
  gy: number;
  gz: number;
};

export type FeatureExtraction = {
  values: number[];
  featureNames: string[];
  sampleCount: number;
  durationMs: number;
};

export type GestureDatasetEntry = {
  id: string;
  label: string;
  values: number[];
  sampleCount: number;
  durationMs: number;
};

export type GestureDataset = {
  featureNames: string[];
  entries: GestureDatasetEntry[];
};

export type GestureModel = {
  labels: string[];
  featureNames: string[];
  featureMeans: number[];
  featureStd: number[];
  weights: number[][];
  biases: number[];
  trainedAt: number;
  trainingSamples: number;
  lossHistory: number[];
};

export type PredictionResult = {
  label: string;
  confidence: number;
  distribution: { label: string; confidence: number }[];
};

export type EvaluationPerLabel = {
  correct: number;
  total: number;
  accuracy: number;
};

export type EvaluationResult = {
  overallAccuracy: number;
  totalSamples: number;
  perLabel: Record<string, EvaluationPerLabel>;
};

const SENSOR_AXES = [
  { key: 'ax', label: 'accel_x' },
  { key: 'ay', label: 'accel_y' },
  { key: 'az', label: 'accel_z' },
  { key: 'gx', label: 'gyro_x' },
  { key: 'gy', label: 'gyro_y' },
  { key: 'gz', label: 'gyro_z' },
] as const;

type AxisKey = (typeof SENSOR_AXES)[number]['key'];

type AxisStats = {
  mean: number;
  std: number;
  min: number;
  max: number;
  range: number;
  energy: number;
  avgAbsDiff: number;
};

function computeAxisStats(values: number[]): AxisStats {
  if (!values.length) {
    return {
      mean: 0,
      std: 0,
      min: 0,
      max: 0,
      range: 0,
      energy: 0,
      avgAbsDiff: 0,
    };
  }
  const n = values.length;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance = values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / n;
  const std = Math.sqrt(variance);
  let min = values[0];
  let max = values[0];
  let energy = 0;
  let totalAbsDiff = 0;
  for (let i = 0; i < n; i++) {
    const v = values[i];
    if (v < min) min = v;
    if (v > max) max = v;
    energy += v * v;
    if (i > 0) totalAbsDiff += Math.abs(v - values[i - 1]);
  }
  const range = max - min;
  const avgAbsDiff = totalAbsDiff / Math.max(1, n - 1);
  return { mean, std, min, max, range, energy: energy / n, avgAbsDiff };
}

function magnitude(values: number[][]): number[] {
  if (!values.length) return [];
  const length = values[0].length;
  const mags: number[] = new Array(length).fill(0);
  for (let axis = 0; axis < values.length; axis++) {
    for (let i = 0; i < length; i++) {
      mags[i] += values[axis][i] * values[axis][i];
    }
  }
  return mags.map((m) => Math.sqrt(m));
}

function statsFromValues(values: number[]) {
  if (!values.length) {
    return { mean: 0, std: 0, energy: 0 };
  }
  const n = values.length;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance = values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / n;
  const std = Math.sqrt(variance);
  const energy = values.reduce((acc, v) => acc + v * v, 0) / n;
  return { mean, std, energy };
}

export function movingAverage(
  samples: SensorSample[],
  window = 3
): SensorSample[] {
  if (window <= 1 || samples.length <= 2) return samples;
  const half = Math.floor(window / 2);
  const filtered: SensorSample[] = [];
  for (let i = 0; i < samples.length; i++) {
    const start = Math.max(0, i - half);
    const end = Math.min(samples.length - 1, i + half);
    const span = end - start + 1;
    const acc: Record<AxisKey | 't', number> = {
      t: samples[i].t,
      ax: 0,
      ay: 0,
      az: 0,
      gx: 0,
      gy: 0,
      gz: 0,
    };
    for (let j = start; j <= end; j++) {
      const s = samples[j];
      acc.ax += s.ax;
      acc.ay += s.ay;
      acc.az += s.az;
      acc.gx += s.gx;
      acc.gy += s.gy;
      acc.gz += s.gz;
    }
    filtered.push({
      t: samples[i].t,
      ax: acc.ax / span,
      ay: acc.ay / span,
      az: acc.az / span,
      gx: acc.gx / span,
      gy: acc.gy / span,
      gz: acc.gz / span,
    });
  }
  return filtered;
}

export function extractFeatureVector(
  samples: SensorSample[]
): FeatureExtraction {
  const sampleCount = samples.length;
  const durationMs = sampleCount
    ? samples[sampleCount - 1].t - samples[0].t
    : 0;
  const featureNames: string[] = [];
  const values: number[] = [];

  const axisValues: Record<AxisKey, number[]> = {
    ax: [],
    ay: [],
    az: [],
    gx: [],
    gy: [],
    gz: [],
  };
  samples.forEach((s) => {
    axisValues.ax.push(s.ax);
    axisValues.ay.push(s.ay);
    axisValues.az.push(s.az);
    axisValues.gx.push(s.gx);
    axisValues.gy.push(s.gy);
    axisValues.gz.push(s.gz);
  });

  const statKeys: (keyof AxisStats)[] = [
    'mean',
    'std',
    'min',
    'max',
    'range',
    'energy',
    'avgAbsDiff',
  ];
  SENSOR_AXES.forEach((axis) => {
    const stats = computeAxisStats(axisValues[axis.key]);
    statKeys.forEach((statKey) => {
      featureNames.push(`${axis.label}_${statKey}`);
      values.push(stats[statKey]);
    });
  });

  const accelMag = magnitude([axisValues.ax, axisValues.ay, axisValues.az]);
  const gyroMag = magnitude([axisValues.gx, axisValues.gy, axisValues.gz]);
  const accelStats = statsFromValues(accelMag);
  const gyroStats = statsFromValues(gyroMag);

  featureNames.push('accel_magnitude_mean');
  values.push(accelStats.mean);
  featureNames.push('accel_magnitude_std');
  values.push(accelStats.std);
  featureNames.push('accel_magnitude_energy');
  values.push(accelStats.energy);

  featureNames.push('gyro_magnitude_mean');
  values.push(gyroStats.mean);
  featureNames.push('gyro_magnitude_std');
  values.push(gyroStats.std);
  featureNames.push('gyro_magnitude_energy');
  values.push(gyroStats.energy);

  featureNames.push('duration_ms');
  values.push(durationMs);
  featureNames.push('sample_count');
  values.push(sampleCount);
  featureNames.push('sample_rate_hz');
  const sampleRate =
    durationMs > 0 ? (sampleCount / durationMs) * 1000 : sampleCount;
  values.push(sampleRate);

  return { values, featureNames, sampleCount, durationMs };
}

function softmax(logits: number[]): number[] {
  const max = Math.max(...logits);
  const exps = logits.map((l) => Math.exp(l - max));
  const sum = exps.reduce((a, b) => a + b, 0) || 1;
  return exps.map((e) => e / sum);
}

export function trainSoftmaxModel(
  dataset: GestureDataset,
  options: { epochs?: number; learningRate?: number } = {}
): GestureModel {
  const { entries, featureNames } = dataset;
  if (!entries.length) {
    throw new Error('Cannot train model without any dataset entries');
  }
  const epochs = options.epochs ?? 200;
  const learningRate = options.learningRate ?? 0.05;
  const labels = Array.from(new Set(entries.map((e) => e.label)));
  const featureCount = featureNames.length;
  const labelCount = labels.length;
  if (labelCount < 2) {
    throw new Error('Need at least two labels to train the model');
  }

  const featureMeans = new Array(featureCount).fill(0);
  const featureStd = new Array(featureCount).fill(0);
  entries.forEach((entry) => {
    entry.values.forEach((value, idx) => {
      featureMeans[idx] += value;
    });
  });
  featureMeans.forEach((_, idx) => {
    featureMeans[idx] /= entries.length;
  });
  entries.forEach((entry) => {
    entry.values.forEach((value, idx) => {
      featureStd[idx] += (value - featureMeans[idx]) ** 2;
    });
  });
  featureStd.forEach((_, idx) => {
    featureStd[idx] = Math.sqrt(featureStd[idx] / entries.length);
    if (featureStd[idx] === 0) featureStd[idx] = 1;
  });

  const normalized = entries.map((entry) =>
    entry.values.map(
      (value, idx) => (value - featureMeans[idx]) / featureStd[idx]
    )
  );

  const weights = Array.from({ length: labelCount }, () =>
    new Array(featureCount).fill(0)
  );
  const biases = new Array(labelCount).fill(0);
  const lossHistory: number[] = [];

  for (let epoch = 0; epoch < epochs; epoch++) {
    const gradW = Array.from({ length: labelCount }, () =>
      new Array(featureCount).fill(0)
    );
    const gradB = new Array(labelCount).fill(0);
    let loss = 0;

    normalized.forEach((row, rowIdx) => {
      const logits = weights.map((w, clsIdx) =>
        w.reduce(
          (sum, weight, featIdx) => sum + weight * row[featIdx],
          biases[clsIdx]
        )
      );
      const probs = softmax(logits);
      const labelIndex = labels.indexOf(entries[rowIdx].label);
      loss += -Math.log(Math.max(probs[labelIndex], 1e-9));
      probs.forEach((prob, clsIdx) => {
        const indicator = clsIdx === labelIndex ? 1 : 0;
        const error = prob - indicator;
        for (let featIdx = 0; featIdx < featureCount; featIdx++) {
          gradW[clsIdx][featIdx] += error * row[featIdx];
        }
        gradB[clsIdx] += error;
      });
    });

    const scale = learningRate / entries.length;
    for (let clsIdx = 0; clsIdx < labelCount; clsIdx++) {
      for (let featIdx = 0; featIdx < featureCount; featIdx++) {
        weights[clsIdx][featIdx] -= gradW[clsIdx][featIdx] * scale;
      }
      biases[clsIdx] -= gradB[clsIdx] * scale;
    }

    lossHistory.push(loss / entries.length);
  }

  return {
    labels,
    featureNames,
    featureMeans,
    featureStd,
    weights,
    biases,
    trainedAt: Date.now(),
    trainingSamples: entries.length,
    lossHistory,
  };
}

export function predictFromModel(
  model: GestureModel,
  values: number[]
): PredictionResult {
  const { featureMeans, featureStd, weights, biases, labels } = model;
  if (!labels.length) {
    throw new Error('Model is empty');
  }
  const normalized = values.map(
    (value, idx) => (value - featureMeans[idx]) / featureStd[idx]
  );
  const logits = weights.map((w, clsIdx) =>
    w.reduce(
      (sum, weight, featIdx) => sum + weight * normalized[featIdx],
      biases[clsIdx]
    )
  );
  const probs = softmax(logits);
  const bestIdx = probs.indexOf(Math.max(...probs));
  const distribution = labels.map((label, idx) => ({
    label,
    confidence: probs[idx],
  }));
  distribution.sort((a, b) => b.confidence - a.confidence);
  return { label: labels[bestIdx], confidence: probs[bestIdx], distribution };
}

/**
 * Baseline: nearest-neighbor classifier in feature space.
 * Uses Euclidean distance on feature vectors, then converts distances into
 * a probability-like distribution with exp(-distance).
 */
export function predictNearestNeighbor(
  dataset: GestureDataset,
  values: number[]
): PredictionResult {
  if (!dataset.entries.length) {
    throw new Error('Dataset is empty');
  }
  const perLabelWeights: Record<string, number> = {};
  dataset.entries.forEach((entry) => {
    const dist = Math.sqrt(
      entry.values.reduce((sum, v, idx) => {
        const d = v - (values[idx] ?? 0);
        return sum + d * d;
      }, 0)
    );
    const w = Math.exp(-dist);
    perLabelWeights[entry.label] = (perLabelWeights[entry.label] ?? 0) + w;
  });
  const labels = Object.keys(perLabelWeights);
  const total =
    labels.reduce((sum, label) => sum + perLabelWeights[label], 0) || 1;
  const distribution = labels
    .map((label) => ({ label, confidence: perLabelWeights[label] / total }))
    .sort((a, b) => b.confidence - a.confidence);
  const best = distribution[0];
  return { label: best.label, confidence: best.confidence, distribution };
}

function shuffleInPlace<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
}

/**
 * Simple train/test split + evaluation helper for the softmax model.
 * This is meant for offline accuracy measurement, not for production inference.
 */
export function evaluateSoftmaxOnDataset(
  dataset: GestureDataset,
  options: {
    testFraction?: number;
    epochs?: number;
    learningRate?: number;
  } = {}
): { result: EvaluationResult; model: GestureModel } {
  const { entries } = dataset;
  if (!entries.length) {
    throw new Error('Cannot evaluate model: dataset is empty');
  }
  const testFraction = options.testFraction ?? 0.2;
  const epochs = options.epochs ?? 250;
  const learningRate = options.learningRate ?? 0.08;

  // Shuffle indices and split into train/test.
  const indices = entries.map((_, idx) => idx);
  shuffleInPlace(indices);
  const testCount = Math.max(1, Math.floor(indices.length * testFraction));
  const testIdx = new Set(indices.slice(0, testCount));
  const trainEntries: GestureDatasetEntry[] = [];
  const testEntries: GestureDatasetEntry[] = [];
  indices.forEach((idx) => {
    if (testIdx.has(idx)) testEntries.push(entries[idx]);
    else trainEntries.push(entries[idx]);
  });

  if (trainEntries.length < 2) {
    throw new Error(
      'Not enough training samples after split; collect more data.'
    );
  }

  const trainDataset: GestureDataset = {
    featureNames: dataset.featureNames,
    entries: trainEntries,
  };

  const model = trainSoftmaxModel(trainDataset, { epochs, learningRate });

  const perLabel: Record<string, EvaluationPerLabel> = {};
  let correct = 0;

  testEntries.forEach((entry) => {
    const pred = predictFromModel(model, entry.values);
    const label = entry.label;
    if (!perLabel[label])
      perLabel[label] = { correct: 0, total: 0, accuracy: 0 };
    perLabel[label].total += 1;
    if (pred.label === label) {
      perLabel[label].correct += 1;
      correct += 1;
    }
  });

  Object.keys(perLabel).forEach((label) => {
    const stats = perLabel[label];
    stats.accuracy = stats.total ? stats.correct / stats.total : 0;
  });

  const totalSamples = testEntries.length;
  const overallAccuracy = totalSamples ? correct / totalSamples : 0;

  return {
    result: { overallAccuracy, totalSamples, perLabel },
    model,
  };
}
