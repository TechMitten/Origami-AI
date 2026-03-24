// Minimal shim for helmet when types are not available
declare module 'helmet' {
  const helmet: any;
  export default helmet;
}
