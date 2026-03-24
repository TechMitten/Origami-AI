// Minimal shim for pidusage to satisfy TypeScript when types are not installed.
declare module 'pidusage' {
  const pidusage: any;
  export default pidusage;
}
