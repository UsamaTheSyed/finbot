export function savePdfDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  try {
    link.click();
  } finally {
    link.remove();
    // Allow the browser to consume the URL before releasing it.
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}
