/**
 * Formats a file size in bytes to a human-readable format
 * @param bytes - The file size in bytes
 * @returns A formatted string like "1.11 MB", "512 KB", etc.
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";

  const units = ["B", "KB", "MB", "GB", "TB"];
  const base = 1024;
  const decimals = 2;

  const i = Math.floor(Math.log(bytes) / Math.log(base));
  const size = bytes / Math.pow(base, i);

  return `${size.toFixed(decimals)} ${units[i]}`;
}
