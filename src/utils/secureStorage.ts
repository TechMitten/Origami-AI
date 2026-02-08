// Simple key for XOR operations - prevents clear text patterns
const SECRET_KEY = 'origami-ai-secure-storage-key';

export const encrypt = (text: string): string => {
  if (!text) return '';
  try {
    let result = '';
    for (let i = 0; i < text.length; i++) {
        result += String.fromCharCode(text.charCodeAt(i) ^ SECRET_KEY.charCodeAt(i % SECRET_KEY.length));
    }
    return 'ENC:' + btoa(result);
  } catch (e) {
    console.error('Failed to encrypt data', e);
    return text;
  }
};

export const decrypt = (text: string): string => {
  if (!text) return '';
  if (!text.startsWith('ENC:')) return text;
  
  try {
    const payload = atob(text.substring(4));
    let result = '';
    for (let i = 0; i < payload.length; i++) {
        result += String.fromCharCode(payload.charCodeAt(i) ^ SECRET_KEY.charCodeAt(i % SECRET_KEY.length));
    }
    return result;
  } catch {
    return text;
  }
};
