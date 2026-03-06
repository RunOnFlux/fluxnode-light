module.exports = {
  root: true,
  env: {
    commonjs: true,
    node: true,
    mocha: true,
  },
  extends: [
    'airbnb-base',
  ],
  rules: {
    'max-len': [
      'error',
      {
        code: 300,
        ignoreUrls: true,
        ignoreTrailingComments: true,
      },
    ],
    'no-console': 'off',
    'no-loss-of-precision': 'off',
    'import/extensions': [
      'error',
      'never',
    ],
    'linebreak-style': 'off',
  },
  overrides: [
    {
      files: [
        '**/__tests__/*.{j,t}s?(x)',
        'test/**/*.test.js',
      ],
      env: {
        mocha: true,
      },
    },
  ],
};
