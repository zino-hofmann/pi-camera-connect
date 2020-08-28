const TEST_REGEX = '(src/__tests__/.*|(\\.|/)(test|spec))\\.(ts?)$';

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testRegex: TEST_REGEX,
  reporters: [
    'default',
    [
      'jest-junit',
      {
        outputDirectory: '.',
        outputName: './coverage/jest/results.xml',
      },
    ],
  ],
  testPathIgnorePatterns: [
    '<rootDir>/node_modules/',
    '<rootDir>/*.config.js',
    '<rootDir>/build',
  ],
  collectCoverageFrom: ['src/**/*.{ts,tsx}'],
  coverageReporters: ['lcov', 'text'],
  coveragePathIgnorePatterns: [
    '<rootDir>/node_modules/',
    '<rootDir>/*.config.js',
    '<rootDir>/build',
  ],
};
