/**
 * Jest configuration for the mobile package.
 *
 * Only the pure modules are tested here — the mappers, the CSV export and the
 * formatting rules. Anything that touches `expo-sqlite`, `expo-file-system` or
 * a native module cannot run under plain Node, so those are covered by the
 * type checker and by the manual verification steps in the README instead of
 * being faked with a mock that proves nothing.
 */

module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["<rootDir>/src/**/*.test.ts"],
  moduleNameMapper: {
    "^@tradevault/core$": "<rootDir>/../../packages/core/src/index.ts",
    // Native modules are stubbed only far enough for the pure modules that
    // import them transitively to resolve.
    "^react-native$": "<rootDir>/test/react-native-stub.js",
    "^expo-sqlite$": "<rootDir>/test/empty-stub.js",
    "^expo-file-system$": "<rootDir>/test/empty-stub.js",
    "^expo-sharing$": "<rootDir>/test/empty-stub.js",
    "^expo-constants$": "<rootDir>/test/empty-stub.js",
  },
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        tsconfig: {
          jsx: "react-jsx",
          esModuleInterop: true,
          skipLibCheck: true,
        },
      },
    ],
  },
};
