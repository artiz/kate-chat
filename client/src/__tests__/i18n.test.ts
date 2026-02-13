import i18n, { SUPPORTED_LANGUAGES, LANGUAGE_STORAGE_KEY, SupportedLanguage } from "../i18n";

describe("i18n configuration", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("should have English as fallback language", () => {
    expect(i18n.options.fallbackLng).toEqual(["en"]);
  });

  it("should support all expected languages", () => {
    expect(SUPPORTED_LANGUAGES).toEqual(["en", "de", "ru", "zh"]);
  });

  it("should define LANGUAGE_STORAGE_KEY", () => {
    expect(LANGUAGE_STORAGE_KEY).toBe("ui-language");
  });

  it("should have translations loaded for all supported languages", () => {
    for (const lang of SUPPORTED_LANGUAGES) {
      expect(i18n.hasResourceBundle(lang, "translation")).toBe(true);
    }
  });

  it("should translate common keys in English", () => {
    i18n.changeLanguage("en");
    expect(i18n.t("common.save")).toBe("Save");
    expect(i18n.t("nav.logout")).toBe("Logout");
    expect(i18n.t("auth.signIn")).toBe("Sign in");
    expect(i18n.t("errors.unauthorized")).toBe("Unauthorized");
  });

  it("should translate common keys in German", () => {
    i18n.changeLanguage("de");
    expect(i18n.t("common.save")).toBe("Speichern");
    expect(i18n.t("nav.logout")).toBe("Abmelden");
    expect(i18n.t("auth.signIn")).toBe("Anmelden");
  });

  it("should translate common keys in Russian", () => {
    i18n.changeLanguage("ru");
    expect(i18n.t("common.save")).toBe("Сохранить");
    expect(i18n.t("nav.logout")).toBe("Выйти");
    expect(i18n.t("auth.signIn")).toBe("Войти");
  });

  it("should translate common keys in Chinese", () => {
    i18n.changeLanguage("zh");
    expect(i18n.t("common.save")).toBe("保存");
    expect(i18n.t("nav.logout")).toBe("退出登录");
    expect(i18n.t("auth.signIn")).toBe("登录");
  });

  it("should handle interpolation", () => {
    i18n.changeLanguage("en");
    expect(i18n.t("auth.welcomeTo", { appTitle: "TestApp" })).toBe("Welcome to TestApp!");
  });

  it("should fall back to English for unsupported languages", () => {
    i18n.changeLanguage("fr");
    expect(i18n.t("common.save")).toBe("Save");
  });

  it("should have error translation keys", () => {
    i18n.changeLanguage("en");
    expect(i18n.t("errors.apiError")).toBe("API Error");
    expect(i18n.t("errors.unknownError")).toBe("An unknown error occurred");
    expect(i18n.t("errors.networkError")).toBe("Unable to connect to the server. Please try again later.");
    expect(i18n.t("errors.forbidden")).toBe("Forbidden");
  });

  it("should have language labels for all supported languages", () => {
    i18n.changeLanguage("en");
    expect(i18n.t("language.en")).toBe("English");
    expect(i18n.t("language.de")).toBe("Deutsch");
    expect(i18n.t("language.ru")).toBe("Русский");
    expect(i18n.t("language.zh")).toBe("中文");
  });
});
