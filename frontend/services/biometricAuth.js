// services/biometricAuth.js
// Biometric authentication using Expo LocalAuthentication

import * as LocalAuthentication from 'expo-local-authentication';

/**
 * Check if biometric authentication is available on the device
 * @returns {Promise<boolean>}
 */
export const isBiometricAvailable = async () => {
  try {
    const compatible = await LocalAuthentication.hasHardwareAsync();
    if (!compatible) return false;
    
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    return enrolled;
  } catch (error) {
    console.error('[Biometric] Error checking availability:', error);
    return false;
  }
};

/**
 * Get the type of biometric authentication available
 * @returns {Promise<string>} - 'fingerprint', 'facial-recognition', 'iris', or 'unknown'
 */
export const getBiometricType = async () => {
  try {
    const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
    if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
      return 'facial-recognition';
    }
    if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
      return 'fingerprint';
    }
    if (types.includes(LocalAuthentication.AuthenticationType.IRIS)) {
      return 'iris';
    }
    return 'unknown';
  } catch (error) {
    console.error('[Biometric] Error getting type:', error);
    return 'unknown';
  }
};

/**
 * Verify user identity using biometric authentication
 * @param {string} promptMessage - Custom message to show in the prompt
 * @returns {Promise<boolean>} - true if authentication succeeded
 */
export const verifyBiometric = async (promptMessage = 'Verify your identity to check in') => {
  try {
    // Check hardware availability
    const compatible = await LocalAuthentication.hasHardwareAsync();
    if (!compatible) {
      throw new Error('Biometric authentication is not available on this device');
    }
    
    // Check if user has enrolled biometrics
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    if (!enrolled) {
      throw new Error('No biometric credentials enrolled. Please set up Face ID/Fingerprint in device settings.');
    }
    
    // Perform authentication
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage,
      cancelLabel: 'Cancel',
      disableDeviceFallback: false, // Allow device PIN as fallback
      fallbackLabel: 'Use PIN',
    });
    
    if (result.error) {
      console.error('[Biometric] Authentication error:', result.error);
      throw new Error(result.error);
    }
    
    return result.success;
  } catch (error) {
    console.error('[Biometric] Verification failed:', error);
    throw error;
  }
};

/**
 * Get a user-friendly label for the biometric type
 * @returns {Promise<string>}
 */
export const getBiometricLabel = async () => {
  const type = await getBiometricType();
  switch (type) {
    case 'facial-recognition':
      return 'Face ID';
    case 'fingerprint':
      return 'Fingerprint';
    case 'iris':
      return 'Iris Scan';
    default:
      return 'Biometric';
  }
};
