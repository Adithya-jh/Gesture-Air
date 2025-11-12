// Expo config plugin to integrate ACRCloud Android SDK when the SDK jar is present.
// This only wires Android. iOS would require adding the ACRCloud framework/pod.

const fs = require('fs');
const path = require('path');
const {
  withAndroidManifest,
  withDangerousMod,
  withMainApplication,
  AndroidConfig,
} = require('expo/config-plugins');

const MODULE_CLASS = 'AcrCloudModule';
const PACKAGE_CLASS = 'AcrCloudPackage';

function writeFileSafely(file, contents) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== contents) {
    fs.writeFileSync(file, contents);
  }
}

function withAcrAndroidSources(config) {
  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      const projectRoot = cfg.modRequest.platformProjectRoot;
      const pkg = (cfg.android && cfg.android.package) || 'com.gesair.launcher';
      const libsJar = path.join(projectRoot, 'app', 'libs', 'acrcloud-android-sdk.jar');
      const hasJar = fs.existsSync(libsJar);

      if (!hasJar) {
        // Don't add sources that reference the SDK if the jar isn't present.
        return cfg;
      }

      const moduleSrc = `package ${pkg}

import android.util.Log
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.acrcloud.rec.*

class ${MODULE_CLASS}(private val ctx: ReactApplicationContext) : ReactContextBaseJavaModule(ctx), IACRCloudListener {
  private var client: ACRCloudClient? = null
  private var inited = false

  override fun getName() = "AcrCloud"

  @ReactMethod
  fun isAvailable(promise: Promise) {
    promise.resolve(true)
  }

  @ReactMethod
  fun start(host: String, key: String, secret: String, promise: Promise) {
    try {
      val config = ACRCloudConfig()
      config.acrcloudListener = this
      config.context = ctx
      config.host = host
      config.accessKey = key
      config.accessSecret = secret
      config.protocol = ACRCloudConfig.ACRCloudNetworkProtocol.HTTP
      config.reqMode = ACRCloudConfig.ACRCloudRecMode.REC_MODE_REMOTE

      if (client == null) client = ACRCloudClient()
      inited = client!!.initWithConfig(config)
      if (!inited) {
        promise.reject("init_failed", "ACRCloud init failed")
        return
      }
      client!!.startPreRecord(3000)
      val started = client!!.startRecognize()
      promise.resolve(started)
    } catch (e: Throwable) {
      promise.reject("start_error", e)
    }
  }

  @ReactMethod
  fun stop(promise: Promise) {
    try {
      client?.cancel()
      promise.resolve(true)
    } catch (e: Throwable) {
      promise.reject("stop_error", e)
    }
  }

  override fun onResult(result: String?) {
    val react = ctx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
    react.emit("AcrCloudResult", result ?: "")
  }

  override fun onVolumeChanged(v: Double) {}
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

      writeFileSafely(path.join(projectRoot, 'app', 'src', 'main', 'java', ...pkg.split('.'), `${MODULE_CLASS}.kt`), moduleSrc);
      writeFileSafely(path.join(projectRoot, 'app', 'src', 'main', 'java', ...pkg.split('.'), `${PACKAGE_CLASS}.kt`), pkgSrc);

      // Ensure libs directory exists for the jar (user must place the SDK jar here)
      fs.mkdirSync(path.join(projectRoot, 'app', 'libs'), { recursive: true });

      return cfg;
    },
  ]);
}

function withAndroidManifestPerm(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults;
    const perms = manifest['manifest']['uses-permission'] || [];
    const need = 'android.permission.RECORD_AUDIO';
    if (!perms.some((p) => p.$['android:name'] === need)) {
      perms.push({ $: { 'android:name': need } });
      manifest['manifest']['uses-permission'] = perms;
    }
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
      src = src.replace(/(List<ReactPackage> packages = new PackageList\(this\)\.getPackages\(\);[\s\S]*?return packages;)/, (m) => {
        return m.replace('return packages;', `packages.add(new ${PACKAGE_CLASS}());\n    return packages;`);
      });
    }
    cfg.modResults.contents = src;
    return cfg;
  });
}

function withGradleLib(config) {
  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      const appBuildGradle = path.join(cfg.modRequest.platformProjectRoot, 'app', 'build.gradle');
      if (fs.existsSync(appBuildGradle)) {
        let gradle = fs.readFileSync(appBuildGradle, 'utf8');
        if (!gradle.includes("implementation files('libs/acrcloud-android-sdk.jar')")) {
          gradle = gradle.replace(/dependencies\s*\{/m, (m) => `${m}\n    implementation files('libs/acrcloud-android-sdk.jar')`);
          fs.writeFileSync(appBuildGradle, gradle);
        }
      }
      return cfg;
    },
  ]);
}

module.exports = function withAcrCloudNative(config) {
  config = withAndroidManifestPerm(config);
  config = withAcrAndroidSources(config);
  config = withGradleLib(config);
  config = withMainApplicationPatch(config);
  return config;
};

