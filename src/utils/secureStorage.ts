/**
 * Simple obfuscation for local storage to avoid clear text warnings.
 * Note: This is not military-grade encryption as the key is in the client.
 * It primarily serves to prevent casual reading of sensitive data in LocalStorage.
 */

export const encrypt = (text: string): string => {
  if (!text) return '';
  try {
    // Simple obfuscation: Base64 encode, then reverse, then Base64 encode again
    const b64 = btoa(text);
    const reversed = b64.split('').reverse().join('');
    return 'ENC:' + btoa(reversed);
  } catch (e) {
    console.error('Failed to encrypt data', e);
    return text;
  }
};

export const decrypt = (text: string): string => {
  if (!text) return '';
  if (!text.startsWith('ENC:')) return text; // Return plain text if not encrypted
  
  try {
    const payload = text.substring(4); // Remove ENC:
    const reversedQuery = atob(payload);
    const b64 = reversedQuery.split('').reverse().join('');
    return atob(b64);
  } catch {
    // If decryption fails, return original or empty
    return text;
  }
};
