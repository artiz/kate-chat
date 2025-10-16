export function formatTokensLimit(num: number): string {
  if (num === 0) return "0";

  const units = ["", "K", "M", "G", "T"];
  if (num <= 8192) return num.toString();

  const base = 1000;

  const i = Math.floor(Math.log(num) / Math.log(base));
  const size = num / Math.pow(base, i);

  return `${Math.ceil(size)}${units[i]}`;
}
