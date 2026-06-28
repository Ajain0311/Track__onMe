// metro.config.js
// Default Expo Metro config + allow bundling on-device ML model files (.tflite)
// as assets so they can be loaded with expo-asset / require().

const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// TensorFlow Lite model files are binary assets, not source modules.
config.resolver.assetExts.push('tflite');

module.exports = config;
