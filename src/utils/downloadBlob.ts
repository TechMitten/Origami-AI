/**
 * Hand a generated Blob to the user as a file download.
 *
 * The object URL is revoked on a delay rather than immediately: Safari can
 * abandon the download if the URL dies before the transfer has been handed off
 * to the browser's download manager.
 */
export function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
