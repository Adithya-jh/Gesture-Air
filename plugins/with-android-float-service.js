// Expo config plugin that adds an Android AccessibilityService and a native module
// to perform system-level recents navigation via tilt. This runs during `expo prebuild`.

const fs = require('fs');
const path = require('path');
const {
  withAndroidManifest,
  withDangerousMod,
  withMainApplication,
  withStringsXml,
  AndroidConfig,
} = require('expo/config-plugins');

const SERVICE_CLASS = 'FloatAccessService';
const RECEIVER_CLASS = 'AppSwitchReceiver';
const MODULE_CLASS = 'FloatControllerModule';
const PACKAGE_CLASS = 'FloatControllerPackage';

function ensureServiceAndReceiver(manifest, pkg) {
  const app = AndroidConfig.Manifest.getMainApplication(manifest);
  if (!app) return manifest;

  app.$ = app.$ || {};
  app.service = app.service || [];
  app.receiver = app.receiver || [];

  const serviceName = `.${SERVICE_CLASS}`;
  const receiverName = `.${RECEIVER_CLASS}`;

  const hasService = (app.service || []).some((s) => s.$ && s.$['android:name'] === serviceName);
  const hasReceiver = (app.receiver || []).some((r) => r.$ && r.$['android:name'] === receiverName);

  if (!hasService) {
    app.service.push({
      $: {
        'android:name': serviceName,
        'android:permission': 'android.permission.BIND_ACCESSIBILITY_SERVICE',
        'android:exported': 'true',
        'android:enabled': 'true',
        'android:label': '@string/accessibility_service_label',
      },
      'intent-filter': [
        {
          action: [{ $: { 'android:name': 'android.accessibilityservice.AccessibilityService' } }],
        },
      ],
      'meta-data': [
        { $: { 'android:name': 'android.accessibilityservice', 'android:resource': '@xml/accessibility_service_config' } },
      ],
    });
  }

  if (!hasReceiver) {
    app.receiver.push({
      $: {
        'android:name': receiverName,
        'android:exported': 'false',
      },
    });
  }

  return manifest;
}

function writeFileSafely(file, contents) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== contents) {
    fs.writeFileSync(file, contents);
  }
}

function kotlinFiles(pkg) {
  return {
    service: {
      relPath: path.join('app', 'src', 'main', 'java', ...pkg.split('.'), `${SERVICE_CLASS}.kt`),
      contents: `package ${pkg}

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.content.Intent
import android.graphics.Path
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.view.accessibility.AccessibilityEvent

class ${SERVICE_CLASS} : AccessibilityService() {
  companion object {
    var instance: ${SERVICE_CLASS}? = null
    private var lastPkg: String? = null
    private val handler = Handler(Looper.getMainLooper())

    fun openRecents() {
      instance?.performGlobalAction(GLOBAL_ACTION_RECENTS)
    }

    private fun horizontalSwipe(fromX: Float, toX: Float, y: Float, start: Long = 40L, duration: Long = 180L) {
      val svc = instance ?: return
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) return
      val path = Path().apply { moveTo(fromX, y); lineTo(toX, y) }
      val stroke = GestureDescription.StrokeDescription(path, start, duration)
      svc.dispatchGesture(GestureDescription.Builder().addStroke(stroke).build(), null, null)
    }

    private fun bottomQuickSwitch(rightwards: Boolean) {
      val svc = instance ?: return
      val dm = svc.resources.displayMetrics
      val w = dm.widthPixels.toFloat()
      val h = dm.heightPixels.toFloat()
      val y = h * 0.98f
      val from = if (rightwards) w * 0.30f else w * 0.70f
      val to = if (rightwards) w * 0.90f else w * 0.10f
      horizontalSwipe(from, to, y)
    }

    private fun recentsSwitch(rightwards: Boolean) {
      val svc = instance ?: return
      openRecents()
      val dm = svc.resources.displayMetrics
      val w = dm.widthPixels.toFloat()
      val h = dm.heightPixels.toFloat()
      // try horizontal swipe across the middle
      val y = h * 0.5f
      val from = if (rightwards) w * 0.75f else w * 0.25f
      val to = if (rightwards) w * 0.25f else w * 0.75f
      handler.postDelayed({ horizontalSwipe(from, to, y) }, 140L)
    }

    private fun verticalSwipe(fromY: Float, toY: Float, x: Float, start: Long = 40L, duration: Long = 180L) {
      val svc = instance ?: return
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) return
      val path = Path().apply { moveTo(x, fromY); lineTo(x, toY) }
      val stroke = GestureDescription.StrokeDescription(path, start, duration)
      svc.dispatchGesture(GestureDescription.Builder().addStroke(stroke).build(), null, null)
    }

    private fun recentsSwitchVertical(next: Boolean) {
      val svc = instance ?: return
      openRecents()
      val dm = svc.resources.displayMetrics
      val w = dm.widthPixels.toFloat()
      val h = dm.heightPixels.toFloat()
      val x = w * 0.5f
      val from = if (next) h * 0.65f else h * 0.35f
      val to = if (next) h * 0.35f else h * 0.65f
      handler.postDelayed({ verticalSwipe(from, to, x) }, 160L)
    }

    private fun switchUsingHeuristics(rightwards: Boolean) {
      val before = lastPkg
      // try bottom quick switch first
      bottomQuickSwitch(rightwards)
      handler.postDelayed({
        if (before == lastPkg) {
          // didn't change; try recents horizontal fallback
          recentsSwitch(rightwards)
          handler.postDelayed({
            if (before == lastPkg) {
              // still didn't change; try vertical recents swipe
              recentsSwitchVertical(rightwards)
            }
          }, 500L)
        }
      }, 500L)
    }

    fun nextApp() { switchUsingHeuristics(true) }
    fun prevApp() { switchUsingHeuristics(false) }
  }

  override fun onServiceConnected() {
    super.onServiceConnected()
    instance = this
  }

  override fun onUnbind(intent: Intent?): Boolean {
    instance = null
    return super.onUnbind(intent)
  }

  override fun onAccessibilityEvent(event: AccessibilityEvent?) {
    if (event == null) return
    if (event.eventType == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED ||
        event.eventType == AccessibilityEvent.TYPE_WINDOWS_CHANGED) {
      lastPkg = event.packageName?.toString() ?: lastPkg
    }
  }
  override fun onInterrupt() {}
}
`,
    },
    receiver: {
      relPath: path.join('app', 'src', 'main', 'java', ...pkg.split('.'), `${RECEIVER_CLASS}.kt`),
      contents: `package ${pkg}

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class ${RECEIVER_CLASS} : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    when (intent.action) {
      "com.gesair.NEXT_APP" -> ${SERVICE_CLASS}.nextApp()
      "com.gesair.PREV_APP" -> ${SERVICE_CLASS}.prevApp()
      "com.gesair.OPEN_RECENTS" -> ${SERVICE_CLASS}.openRecents()
    }
  }
}
`,
    },
    module: {
      relPath: path.join('app', 'src', 'main', 'java', ...pkg.split('.'), `${MODULE_CLASS}.kt`),
      contents: `package ${pkg}

import android.content.Context
import android.content.Intent
import android.provider.Settings
import android.view.accessibility.AccessibilityManager
import android.accessibilityservice.AccessibilityServiceInfo
import com.facebook.react.bridge.*

class ${MODULE_CLASS}(private val ctx: ReactApplicationContext) : ReactContextBaseJavaModule(ctx) {
  override fun getName() = "FloatController"

  @ReactMethod
  fun openAccessibilitySettings() {
    val i = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)
    i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    ctx.startActivity(i)
  }

  @ReactMethod
  fun isServiceEnabled(promise: Promise) {
    val am = ctx.getSystemService(Context.ACCESSIBILITY_SERVICE) as AccessibilityManager
    val enabled = am.getEnabledAccessibilityServiceList(AccessibilityServiceInfo.FEEDBACK_ALL_MASK)
      .any { it.resolveInfo.serviceInfo.packageName == ctx.packageName && it.resolveInfo.serviceInfo.name.contains("${SERVICE_CLASS}") }
    promise.resolve(enabled)
  }

  private fun send(action: String) {
    ctx.sendBroadcast(Intent(action))
  }

  @ReactMethod fun nextApp() { send("com.gesair.NEXT_APP") }
  @ReactMethod fun prevApp() { send("com.gesair.PREV_APP") }
}
`,
    },
    pkg: {
      relPath: path.join('app', 'src', 'main', 'java', ...pkg.split('.'), `${PACKAGE_CLASS}.kt`),
      contents: `package ${pkg}

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class ${PACKAGE_CLASS} : ReactPackage {
  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> = listOf(${MODULE_CLASS}(reactContext))
  override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}
`,
    },
  };
}

function withSourceFiles(config) {
  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      const projectRoot = cfg.modRequest.platformProjectRoot;
      const pkg = (cfg.android && cfg.android.package) || 'com.gesair.launcher';
      const files = kotlinFiles(pkg);

      writeFileSafely(path.join(projectRoot, files.service.relPath), files.service.contents);
      writeFileSafely(path.join(projectRoot, files.receiver.relPath), files.receiver.contents);
      writeFileSafely(path.join(projectRoot, files.module.relPath), files.module.contents);
      writeFileSafely(path.join(projectRoot, files.pkg.relPath), files.pkg.contents);

      // XML config
      const xmlPath = path.join(projectRoot, 'app', 'src', 'main', 'res', 'xml', 'accessibility_service_config.xml');
      writeFileSafely(
        xmlPath,
        `<?xml version="1.0" encoding="utf-8"?>\n<accessibility-service xmlns:android="http://schemas.android.com/apk/res/android"\n  android:description="@string/accessibility_service_desc"\n  android:accessibilityEventTypes="typeAllMask"\n  android:accessibilityFeedbackType="feedbackGeneric"\n  android:notificationTimeout="100"\n  android:canRetrieveWindowContent="true"\n  android:accessibilityFlags="flagDefault"/>\n`
      );

      return cfg;
    },
  ]);
}

function withMainApplicationPatch(config) {
  return withMainApplication(config, (cfg) => {
    let src = cfg.modResults.contents;
    if (!src.includes(`import ${cfg.android?.package || 'com.gesair.launcher'}.${PACKAGE_CLASS}`)) {
      src = src.replace(/(package [^\n]+\n)/, `$1import ${(cfg.android && cfg.android.package) || 'com.gesair.launcher'}.${PACKAGE_CLASS}\n`);
    }
    if (!src.includes(`new ${PACKAGE_CLASS}()`)) {
      src = src.replace(/(List<ReactPackage> packages = new PackageList\(this\)\.getPackages\(\);[\s\S]*?return packages;)/, (m) => {
        return m.replace('return packages;', `packages.add(new ${PACKAGE_CLASS}());\n    return packages;`);
      });
    }
    cfg.modResults.contents = src;
    return cfg;
  });
}

module.exports = function withAndroidFloatService(config) {
  const pkg = (config.android && config.android.package) || 'com.gesair.launcher';
  config = withAndroidManifest(config, (cfg) => {
    cfg.modResults = ensureServiceAndReceiver(cfg.modResults, pkg);
    return cfg;
  });
  config = withStringsXml(config, (cfg) => {
    cfg.modResults = AndroidConfig.Strings.setStringItem([{
      $: { name: 'accessibility_service_label' },
      _: 'gesAir Floating Service',
    }, {
      $: { name: 'accessibility_service_desc' },
      _: 'Allows gesAir to navigate recents using gestures.',
    }], cfg.modResults);
    return cfg;
  });
  config = withSourceFiles(config);
  config = withMainApplicationPatch(config);
  return config;
};
