export async function scanReceipt(
  _image: string,
  _onProgress: (progress: number) => void,
): Promise<string> {
  throw new Error(
    "Receipt OCR runs in Fairshare on the web. Open your account in a browser to scan, or enter the receipt items here.",
  );
}
