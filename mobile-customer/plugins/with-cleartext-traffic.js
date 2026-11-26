const { withAndroidManifest, withProjectBuildGradle } = require('expo/config-plugins');

module.exports = function withCleartextTraffic(config) {
  config = withAndroidManifest(config, (cfg) => {
    const app = cfg.modResults.manifest.application?.[0];
    if (app) {
      app.$['android:usesCleartextTraffic'] = 'true';
    }
    return cfg;
  });

  config = withProjectBuildGradle(config, (cfg) => {
    if (cfg.modResults.contents.includes("classpath('org.jetbrains.kotlin:kotlin-gradle-plugin')")) {
      cfg.modResults.contents = cfg.modResults.contents.replace(
        "classpath('org.jetbrains.kotlin:kotlin-gradle-plugin')",
        'classpath("org.jetbrains.kotlin:kotlin-gradle-plugin:$kotlinVersion")',
      );
    }
    return cfg;
  });

  return config;
};
