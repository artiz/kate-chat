/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["**/__tests__/**/*.test.ts"],
  coverageDirectory: "coverage",
  collectCoverageFrom: ["src/**/*.ts", "!src/**/*.d.ts"],
  globalSetup: "<rootDir>/jest.setup.js",
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
};
