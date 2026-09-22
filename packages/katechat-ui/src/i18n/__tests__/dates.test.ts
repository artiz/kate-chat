import { formatDateTime, formatDay, getAppTimeZone, setAppTimeZone } from "../index";

/** A message saved at 07:35:43 UTC: 09:35:43 in Vienna, 03:35:43 in New York. */
const SAVED_AT = "2026-09-22T07:35:43.000Z";

describe("app time zone", () => {
  afterEach(() => setAppTimeZone(undefined));

  it("falls back to the browser zone when nothing is set", () => {
    expect(getAppTimeZone()).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
  });

  it("renders the same instant in the zone the user picked", () => {
    setAppTimeZone("Europe/Vienna");
    const vienna = formatDateTime(SAVED_AT);

    setAppTimeZone("America/New_York");
    const newYork = formatDateTime(SAVED_AT);

    expect(vienna).toContain("09:35:43");
    expect(newYork).toContain("03:35:43");
  });

  it("an empty setting means the browser zone, not UTC", () => {
    setAppTimeZone("Europe/Vienna");
    setAppTimeZone("");

    expect(getAppTimeZone()).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
  });

  it("formats a day in the selected zone", () => {
    // 23:30 UTC is already the next day in Vienna
    setAppTimeZone("Europe/Vienna");
    expect(formatDay("2026-09-22T23:30:00.000Z")).toContain("23");

    setAppTimeZone("America/New_York");
    expect(formatDay("2026-09-22T23:30:00.000Z")).toContain("22");
  });
});
