#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

import { trainSoftmaxModel, type GestureDataset } from '../modules/gesture-ml';

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
  console.log(`Train the ML gesture model with Node.\n\n` +
    `Usage:\n  npm run train:ml -- <dataset.json> [output.json] [--epochs=400] [--lr=0.05]\n`);
}

async function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  if (!positional.length || flags.help) {
    printUsage();
    process.exit(flags.help ? 0 : 1);
  }

  const datasetPath = resolve(positional[0]);
  const outputPath = positional[1] ? resolve(positional[1]) : resolve('gesture_ml_model.json');
  const epochs = flags.epochs ? Number(flags.epochs) : 400;
  const learningRate = flags.lr ? Number(flags.lr) : 0.06;

  if (!Number.isFinite(epochs) || epochs <= 0) {
    throw new Error('epochs must be a positive number');
  }
  if (!Number.isFinite(learningRate) || learningRate <= 0) {
    throw new Error('lr must be a positive number');
  }

  const raw = readFileSync(datasetPath, 'utf8');
  const dataset = JSON.parse(raw) as GestureDataset;
  console.log(`Training on ${dataset.entries.length} samples across ${dataset.featureNames.length} features...`);
  const model = trainSoftmaxModel(dataset, { epochs, learningRate });
  writeFileSync(outputPath, JSON.stringify(model, null, 2));
  console.log(`Model written to ${outputPath}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
