/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "jsdom",
  setupFilesAfterEnv: ["<rootDir>/src/setupTests.ts"],
  moduleNameMapper: {
    "^@katechat/ui$": "<rootDir>/../packages/katechat-ui/src/i18n/index.ts",
    "^@/(.*)$": "<rootDir>/src/$1",
    "\\.(css|less|scss|sass)$": "<rootDir>/src/__mocks__/styleMock.js",
    "\\.(jpg|jpeg|png|gif|webp|svg)$": "<rootDir>/src/__mocks__/fileMock.js",
  },
  transform: {
    "^.+\\.[tj]sx?$": [
      "ts-jest",
      {
        tsconfig: {
          jsx: "react-jsx",
        },
      },
    ],
  },
  testMatch: ["**/__tests__/**/*.test.(ts|tsx)"],
  coverageDirectory: "coverage",
  collectCoverageFrom: ["src/**/*.{ts,tsx}", "!src/**/*.d.ts"],
};
