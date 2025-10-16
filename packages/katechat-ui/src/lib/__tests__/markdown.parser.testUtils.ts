// Test utilities to access internal functions
// This file helps test non-exported functions from MarkdownParser

import { parseMarkdown } from "../markdown.parser";

/**
 * Test the sanitizeUrl function indirectly by checking link rendering
 */
export function testSanitizeUrl(url: string): string {
  const testMarkdown = `[test](${url})`;
  const result = parseMarkdown(testMarkdown);

  // Extract href value from the rendered HTML
  const match = result[0].match(/href="([^"]*)"/);
  return match ? match[1] : "";
}

/**
 * Test if a URL gets blocked (returns empty href)
 */
export function testUrlBlocked(url: string): boolean {
  return testSanitizeUrl(url) === "";
}

/**
 * Test if a URL gets allowed and properly escaped
 */
export function testUrlAllowed(url: string, expectedUrl?: string): boolean {
  const result = testSanitizeUrl(url);
  return result !== "" && (expectedUrl ? result === expectedUrl : true);
}
