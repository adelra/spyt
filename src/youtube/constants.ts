// Public API key used by the YouTube Music web client (WEB_REMIX).
// Not a secret — visible in any browser's DevTools on music.youtube.com.
// Override with SPYT_YTM_API_KEY env var if Google rotates it.
export const YTM_API_KEY = process.env.SPYT_YTM_API_KEY ?? 'AIzaSyC9XL3ZjWddXya6X74dJoCTL-WEYFDNX30';

export const YTM_ORIGIN = 'https://music.youtube.com';
export const YTM_CLIENT_NAME = 'WEB_REMIX';
export const YTM_CLIENT_VERSION = '1.20241023.01.00';
