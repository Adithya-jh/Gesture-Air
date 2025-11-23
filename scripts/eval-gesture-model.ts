#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

import type { GestureDataset } from '../modules/gesture-ml';
import { evaluateSoftmaxOnDataset } from '../modules/gesture-ml';

type FlagMap = Record<string, string>;

function parseArgs(argv: string[]) {
  const positional: string[] = [];
  const flags: FlagMap = {};
  argv.forEach((arg) => {
    if (arg.startsWith('--')) {
      const [rawKey, rawValue] = arg.replace(/^--/, '').split('=');
      flags[rawKey] = rawValue ?? 'true';
    } else {
      positional.push(arg);
    }
  });
  return { positional, flags };
}

function printUsage() {
  console.log(
    [
      'Evaluate the softmax gesture model on a held-out test split.',
      '',
      'Usage:',
      '  npm run eval:ml -- <dataset.json> [--testFraction=0.2] [--epochs=250] [--lr=0.08]',
      '',
      'The dataset JSON should be an exported gesture_ml_dataset.json from the ML tab.',
    ].join('\n')
  );
}

async function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  if (!positional.length || flags.help) {
    printUsage();
    process.exit(flags.help ? 0 : 1);
  }

  const datasetPath = resolve(positional[0]);
  const testFraction = flags.testFraction ? Number(flags.testFraction) : 0.2;
  const epochs = flags.epochs ? Number(flags.epochs) : 250;
  const learningRate = flags.lr ? Number(flags.lr) : 0.08;

  if (!(testFraction > 0 && testFraction < 1)) {
    throw new Error('testFraction must be between 0 and 1 (e.g. 0.2)');
  }

  const raw = readFileSync(datasetPath, 'utf8');
  const dataset = JSON.parse(raw) as GestureDataset;
  if (!dataset.featureNames || !Array.isArray(dataset.entries)) {
    throw new Error('Dataset JSON missing featureNames or entries.');
  }

  console.log(
    `Evaluating on ${dataset.entries.length} samples ` +
      `(testFraction=${testFraction}, epochs=${epochs}, lr=${learningRate})...`
  );

  const { result } = evaluateSoftmaxOnDataset(dataset, {
    testFraction,
    epochs,
    learningRate,
  });

  console.log('');
  console.log(`Overall accuracy: ${(result.overallAccuracy * 100).toFixed(2)}%`);
  console.log(`Total test samples: ${result.totalSamples}`);
  console.log('');
  console.log('Per-label accuracy:');
  Object.entries(result.perLabel).forEach(([label, stats]) => {
    const pct = (stats.accuracy * 100).toFixed(2);
    console.log(`  ${label}: ${pct}% (${stats.correct}/${stats.total})`);
  });
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

