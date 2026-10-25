/**
 * Writing a file and handing it to the OS share sheet.
 *
 * The app has no server to upload to, and it should not need one: an export is
 * the user's own data leaving through their own share target (email, Drive,
 * Files). Returns false when sharing is unavailable so the caller can say so
 * rather than silently doing nothing.
 */

import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";

export async function writeAndShare(
  fileName: string,
  contents: string,
  mimeType: string
): Promise<boolean> {
  if (!(await Sharing.isAvailableAsync())) {
    return false;
  }

  const directory = FileSystem.cacheDirectory;
  if (!directory) {
    return false;
  }

  const uri = `${directory}${fileName}`;

  // A previous export with the same name would otherwise be appended to.
  const existing = await FileSystem.getInfoAsync(uri);
  if (existing.exists) {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  }

  await FileSystem.writeAsStringAsync(uri, contents);

  await Sharing.shareAsync(uri, {
    mimeType,
    dialogTitle: fileName,
    UTI: mimeType,
  });

  return true;
}
