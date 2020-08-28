module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  extends: [
    'airbnb-base',
    'plugin:@typescript-eslint/recommended',
    'prettier',
    'prettier/@typescript-eslint',
    'plugin:prettier/recommended',
  ],
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
  },
  env: {
    node: true,
    jest: true,
  },
  rules: {
    'eol-last': ['error', 'always'],
    'no-plusplus': ['error', { allowForLoopAfterthoughts: true }],
    'import/extensions': ['off'],
    'import/prefer-default-export': ['off'],
    '@typescript-eslint/no-empty-interface': ['off'],
    '@typescript-eslint/explicit-function-return-type': ['off'],
  },
  overrides: [
    {
      files: ['**/*.spec.ts'],
      rules: {
        'import/no-extraneous-dependencies': [
          'error',
          { devDependencies: true },
        ],
        '@typescript-eslint/no-empty-function': ['off'],
        '@typescript-eslint/no-non-null-assertion': ['off'],
      },
    },
  ],
  settings: {
    'import/resolver': {
      node: {
        extensions: ['.js', '.ts'],
      },
    },
  },
};
