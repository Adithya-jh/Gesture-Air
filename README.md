# Gesture Air Launcher

An Expo Router workspace for capturing mid-air gestures and mapping them to app launches. Two experiences ship side-by-side:

- **Recorder** (`/gesture` tab): collect DTW-friendly templates, inspect intra-gesture drift, and quickly reroute gestures to deeplinks.
- **ML Launcher** (`/ml` tab): capture raw IMU bursts, extract statistical feature vectors, train a softmax model, and open apps purely from predictions.

## Getting started

```bash
npm install
npx expo start
```

Open the project inside Expo Go, an emulator, or a development build.

## ML workflow

1. Navigate to the **ML** tab (or use the "Open ML launcher" CTA in Explore).
2. For each label (maps, whatsapp, etc.) record gestures and tap **Save to dataset**. Aim for 10–20 samples per label.
3. Use the dataset card to export `gesture_ml_dataset.json`. You can share it via AirDrop, Files, or copy it to your clipboard.
4. Train a model locally:

   ```bash
   npm run train:ml -- gesture_ml_dataset.json gesture_ml_model.json --epochs=400 --lr=0.06
   ```

   The script reads the dataset, trains the shared softmax model, and writes a drop-in `gesture_ml_model.json` file.
5. Import the model inside the ML tab and tap **Predict & open app** after recording a fresh gesture. When the model is >55% confident it opens the mapped app using the same routing table as the legacy recorder.

You can also train directly on-device via the **Train model** button, which runs the same helper as the CLI script.

## Project scripts

- `npm run start` – boot Expo.
- `npm run lint` – Expo lint rules.
- `npm run train:ml -- <dataset.json> [output.json] [--epochs=400] [--lr=0.05]` – train the ML model from any exported dataset JSON.

## Files to know

- `app/gesture.tsx` – template recorder / DTW launcher.
- `app/ml.tsx` – ML-first launcher with dataset management, training, and prediction tools.
- `modules/gesture-ml.ts` – feature extraction + softmax training helpers shared by the app and CLI script.
- `scripts/train-gesture-model.ts` – CLI entry for training models on your laptop.

Grab the `android/app/build/outputs/apk/debug/app-debug.apk` artifact when you need to sideload quickly.
