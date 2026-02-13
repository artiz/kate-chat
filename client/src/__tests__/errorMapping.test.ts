import { mapServerError } from "../i18n/errorMapping";
import i18n from "../i18n";

describe("mapServerError", () => {
  beforeEach(() => {
    i18n.changeLanguage("en");
  });

  it("should map exact 'Unauthorized' error", () => {
    expect(mapServerError("Unauthorized")).toBe("Unauthorized");
  });

  it("should map exact 'Forbidden' error", () => {
    expect(mapServerError("Forbidden")).toBe("Forbidden");
  });

  it("should map exact 'Unknown error'", () => {
    expect(mapServerError("Unknown error")).toBe("An unknown error occurred");
  });

  it("should map exact 'Internal server error'", () => {
    expect(mapServerError("Internal server error")).toBe("Internal server error");
  });

  it("should map exact 'Internal Server Error'", () => {
    expect(mapServerError("Internal Server Error")).toBe("Internal server error");
  });

  it("should map exact 'Bad Request'", () => {
    expect(mapServerError("Bad Request")).toBe("Bad request");
  });

  it("should map exact 'Not Found'", () => {
    expect(mapServerError("Not Found")).toBe("Resource not found");
  });

  it("should map exact 'Too Many Requests'", () => {
    expect(mapServerError("Too Many Requests")).toBe("Too many requests. Please try again later.");
  });

  it("should map exact 'Service Unavailable'", () => {
    expect(mapServerError("Service Unavailable")).toBe("Service temporarily unavailable");
  });

  it("should map partial match for 'unauthorized' in message", () => {
    expect(mapServerError("User is unauthorized")).toBe("Unauthorized");
  });

  it("should map partial match for 'forbidden' in message", () => {
    expect(mapServerError("Access is forbidden for this resource")).toBe("Forbidden");
  });

  it("should map partial match for 'not found' in message", () => {
    expect(mapServerError("The resource was not found")).toBe("Resource not found");
  });

  it("should map partial match for 'rate limit' in message", () => {
    expect(mapServerError("Rate limit exceeded")).toBe("Too many requests. Please try again later.");
  });

  it("should return original message for unknown errors", () => {
    expect(mapServerError("Something completely custom happened")).toBe("Something completely custom happened");
  });

  it("should translate errors in German", () => {
    i18n.changeLanguage("de");
    expect(mapServerError("Unauthorized")).toBe("Nicht autorisiert");
    expect(mapServerError("Forbidden")).toBe("Zugriff verweigert");
  });

  it("should translate errors in Russian", () => {
    i18n.changeLanguage("ru");
    expect(mapServerError("Unauthorized")).toBe("Не авторизован");
    expect(mapServerError("Forbidden")).toBe("Доступ запрещён");
  });

  it("should translate errors in Chinese", () => {
    i18n.changeLanguage("zh");
    expect(mapServerError("Unauthorized")).toBe("未授权");
    expect(mapServerError("Forbidden")).toBe("禁止访问");
  });
});
