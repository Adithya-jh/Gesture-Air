// Expo config plugin to add an Android native module that reads recent app network usage
// using NetworkStatsManager + UsageStatsManager. Requires user to grant Usage Access.

const fs = require('fs');
const path = require('path');
const { withAndroidManifest, withDangerousMod, withMainApplication, AndroidConfig } = require('expo/config-plugins');

const MODULE_CLASS = 'UsageMonitorModule';
const PACKAGE_CLASS = 'UsageMonitorPackage';

function writeFile(file, contents) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== contents) {
    fs.writeFileSync(file, contents);
  }
}

function withSources(config) {
  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      const projectRoot = cfg.modRequest.platformProjectRoot;
      const pkg = (cfg.android && cfg.android.package) || 'com.gesair.launcher';
      const javaDir = path.join(projectRoot, 'app', 'src', 'main', 'java', ...pkg.split('.'));

      const moduleSrc = `package ${pkg}

import android.app.AppOpsManager
import android.app.usage.NetworkStats
import android.app.usage.NetworkStatsManager
import android.app.usage.UsageStats
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.net.ConnectivityManager
import android.os.Build
import android.provider.Settings
import com.facebook.react.bridge.*

class ${MODULE_CLASS}(private val ctx: ReactApplicationContext) : ReactContextBaseJavaModule(ctx) {
  override fun getName() = "UsageMonitor"

  @ReactMethod
  fun isAvailable(promise: Promise) {
    promise.resolve(Build.VERSION.SDK_INT >= Build.VERSION_CODES.M)
  }

  @ReactMethod
  fun hasUsageAccess(promise: Promise) {
    val appOps = ctx.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
    val mode = appOps.checkOpNoThrow("android:get_usage_stats", android.os.Process.myUid(), ctx.packageName)
    promise.resolve(mode == AppOpsManager.MODE_ALLOWED)
  }

  @ReactMethod
  fun openUsageAccessSettings() {
    val i = Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS)
    i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    ctx.startActivity(i)
  }

  @ReactMethod
  fun getNetworkSummary(sinceMs: Double, promise: Promise) {
    val result = WritableNativeArray()
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) { promise.resolve(result); return }
    try {
      val nsm = ctx.getSystemService(Context.NETWORK_STATS_SERVICE) as NetworkStatsManager
      val start = System.currentTimeMillis() - sinceMs.toLong()
      val end = System.currentTimeMillis()
      val map = hashMapOf<Int, LongArray>() // uid -> [rx, tx]
      fun collect(type: Int, subscriberId: String?) {
        try {
          val stats: NetworkStats = nsm.querySummary(type, subscriberId, start, end)
          val bucket = NetworkStats.Bucket()
          while (stats.hasNextBucket()) {
            stats.getNextBucket(bucket)
            val uid = bucket.uid
            val arr = map.getOrPut(uid) { longArrayOf(0, 0) }
            arr[0] += bucket.rxBytes
            arr[1] += bucket.txBytes
          }
          stats.close()
        } catch (_: Throwable) {}
      }
      collect(ConnectivityManager.TYPE_WIFI, null)
      // Mobile collection may require extra permission; try best-effort
      collect(ConnectivityManager.TYPE_MOBILE, null)

      // usage last used
      val usm = ctx.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
      val usage: List<UsageStats> = usm.queryUsageStats(UsageStatsManager.INTERVAL_DAILY, start, end) ?: listOf()
      val lastUsed = hashMapOf<String, Long>()
      for (u in usage) {
        lastUsed[u.packageName] = maxOf(lastUsed[u.packageName] ?: 0L, u.lastTimeUsed)
      }

      val pm = ctx.packageManager
      for ((uid, bytes) in map) {
        val pkgs = pm.getPackagesForUid(uid) ?: emptyArray()
        for (p in pkgs) {
          val obj = WritableNativeMap()
          obj.putString("packageName", p)
          obj.putInt("uid", uid)
          obj.putDouble("rxBytes", bytes[0].toDouble())
          obj.putDouble("txBytes", bytes[1].toDouble())
          obj.putDouble("lastTimeUsed", (lastUsed[p] ?: 0L).toDouble())
          result.pushMap(obj)
        }
      }
      promise.resolve(result)
    } catch (e: Throwable) {
      promise.reject("usage_error", e)
    }
  }
}
`;

      const pkgSrc = `package ${pkg}

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class ${PACKAGE_CLASS} : ReactPackage {
  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> = listOf(${MODULE_CLASS}(reactContext))
  override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}
`;

      writeFile(path.join(javaDir, `${MODULE_CLASS}.kt`), moduleSrc)
      writeFile(path.join(javaDir, `${PACKAGE_CLASS}.kt`), pkgSrc)
      return cfg;
    },
  ]);
}

function withUsagePermission(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults;
    const perms = manifest.manifest['uses-permission'] || [];
    const add = (name) => { if (!perms.some((p)=>p.$['android:name']===name)) perms.push({ $: { 'android:name': name } }); };
    add('android.permission.PACKAGE_USAGE_STATS');
    // Optional but improves mapping UID->package name on Android 11+
    add('android.permission.QUERY_ALL_PACKAGES');
    manifest.manifest['uses-permission'] = perms;
    return cfg;
  });
}

function withMainApplicationPatch(config) {
  return withMainApplication(config, (cfg) => {
    let src = cfg.modResults.contents;
    const pkg = cfg.android?.package || 'com.gesair.launcher';
    if (!src.includes(`import ${pkg}.${PACKAGE_CLASS}`)) {
      src = src.replace(/(package [^\n]+\n)/, `$1import ${pkg}.${PACKAGE_CLASS}\n`);
    }
    if (!src.includes(`new ${PACKAGE_CLASS}()`)) {
      src = src.replace(/(List<ReactPackage> packages = new PackageList\(this\)\.getPackages\(\);[\s\S]*?return packages;)/, (m) => m.replace('return packages;', `packages.add(new ${PACKAGE_CLASS}());\n    return packages;`));
    }
    cfg.modResults.contents = src;
    return cfg;
  });
}

module.exports = function withAndroidUsageMonitor(config) {
  config = withUsagePermission(config);
  config = withSources(config);
  config = withMainApplicationPatch(config);
  return config;
};
