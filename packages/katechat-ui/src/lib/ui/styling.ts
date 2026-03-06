export function getCSSVariableColor(variableName: string, defaultValue: string = "#000000"): string {
  const variable = variableName.startsWith("--") ? variableName : `--${variableName}`;
  const value = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
  return value || defaultValue;
}
