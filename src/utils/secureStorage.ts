// Replace this with a unique random string. 
// Note: In client-side storage, this serves as obfuscation to prevent plain-text snooping.
// For true cryptographic security, a backend or a user-provided master password is required.
const SECRET_KEY = '5f8a2b3c7e9d1f4a6b0c8d2e5f1a9b3c4d7e0f2a8b6c4d5e9f1a0b3c5d7e8f2a';

/**
 * Encrypts a string using XOR and Base64.
 * Useful for obscuring data in localStorage.
 */
export const encrypt = (text: string): string => {
  if (!text) return '';
  try {
    let result = '';
    for (let i = 0; i < text.length; i++) {
      // Use XOR with the secret key
      result += String.fromCharCode(text.charCodeAt(i) ^ SECRET_KEY.charCodeAt(i % SECRET_KEY.length));
    }
    // Return with a prefix to identify encrypted content
    // We use encodeURIComponent to handle non-ASCII/Unicode characters properly before btoa
    return 'ENC:' + btoa(encodeURIComponent(result));
  } catch (e) {
    console.error('[SecureStorage] Encryption failed:', e);
    return text; // Fallback to plain text on failure
  }
};

/**
 * Decrypts a string that was previously encrypted with the above method.
 */
export const decrypt = (text: string): string => {
  // If it's empty or doesn't have our prefix, return as-is
  if (!text || !text.startsWith('ENC:')) return text;

  try {
    // Remove prefix, decode base64, then decode the component back to original Unicode
    const payload = decodeURIComponent(atob(text.substring(4)));
    let result = '';
    for (let i = 0; i < payload.length; i++) {
      result += String.fromCharCode(payload.charCodeAt(i) ^ SECRET_KEY.charCodeAt(i % SECRET_KEY.length));
    }
    return result;
  } catch (e) {
    console.warn('[SecureStorage] Decryption failed, returning input:', e);
    return text;
  }
};

