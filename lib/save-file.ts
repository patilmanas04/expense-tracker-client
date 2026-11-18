export type SaveResult = "shared" | "downloaded" | "cancelled";

/**
 * Hands a text file to the share sheet on a phone (Save to Files, Numbers, Mail…), or downloads it.
 * Call it straight from the tap, with no await before it, so iOS still allows the share.
 */
export async function saveFile(text: string, name: string, type: string): Promise<SaveResult> {
  const file = new File([text], name, { type });
  // Desktop browsers also report canShare, but a download is what you want there, so only touch devices share.
  const touch = typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
  if (touch && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return "shared";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
      // Anything else (e.g. NotAllowedError): download instead.
    }
  }
  download(file, name);
  return "downloaded";
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.rel = "noopener";
  link.style.display = "none";
  document.body.append(link);
  link.click();
  link.remove();
  // Not revoked straight away: Safari can cancel a download whose URL goes in the same task.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
