const fs = require('fs/promises');
const path = require('path');
const { withDangerousMod } = require('@expo/config-plugins');

const resolutionRule = 'resolutionStrategy.force "com.google.guava:listenablefuture:1.0"';

module.exports = function withFaceVisionAndroidCameraXFix(config) {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const gradleFile = path.join(
        config.modRequest.projectRoot,
        'node_modules',
        '@rbayuokt',
        'expo-face-vision',
        'android',
        'build.gradle'
      );
      const source = await fs.readFile(gradleFile, 'utf8');
      if (source.includes(resolutionRule)) return config;

      const marker = 'android {\n';
      if (!source.includes(marker)) {
        throw new Error(`Could not find Android block in ${gradleFile}`);
      }

      const fixedSource = source.replace(
        marker,
        `configurations.configureEach {\n  ${resolutionRule}\n}\n\n${marker}`
      );
      await fs.writeFile(gradleFile, fixedSource, 'utf8');
      return config;
    },
  ]);
};
