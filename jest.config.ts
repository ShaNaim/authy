import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/tests"],
  moduleNameMapper: {
    "^@/config/(.*)$": "<rootDir>/src/config/$1",
    "^@/constants$": "<rootDir>/src/constants/index",
    "^@/constants/(.*)$": "<rootDir>/src/constants/$1",
    "^@/types$": "<rootDir>/src/types/index",
    "^@/types/(.*)$": "<rootDir>/src/types/$1",
    "^@/utils$": "<rootDir>/src/utils/index",
    "^@/utils/(.*)$": "<rootDir>/src/utils/$1",
    "^@/services$": "<rootDir>/src/services/index",
    "^@/services/(.*)$": "<rootDir>/src/services/$1",
    "^@/repositories$": "<rootDir>/src/repositories/index",
    "^@/repositories/(.*)$": "<rootDir>/src/repositories/$1",
    "^@/middleware$": "<rootDir>/src/middleware/index",
    "^@/middleware/(.*)$": "<rootDir>/src/middleware/$1",
    "^@/controllers$": "<rootDir>/src/controllers/index",
    "^@/controllers/(.*)$": "<rootDir>/src/controllers/$1",
    "^@/routes$": "<rootDir>/src/routes/index",
    "^@/routes/(.*)$": "<rootDir>/src/routes/$1",
    "^@/app$": "<rootDir>/src/app",
  },
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { tsconfig: "./tsconfig.test.json" }],
    "^.+\\.js$": ["ts-jest", { tsconfig: "./tsconfig.test.json" }],
  },
  transformIgnorePatterns: [
    "/node_modules/(?!(uuid)/)",
  ],
  testMatch: ["**/*.test.ts"],
  collectCoverageFrom: [
    "src/**/*.ts",
    "!src/index.ts",
    "!src/**/*.d.ts",
  ],
  coverageDirectory: "coverage",
  coverageReporters: ["text", "lcov", "html"],
  verbose: true,
  testTimeout: 30000,
};

export default config;
