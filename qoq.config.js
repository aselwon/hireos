const ignored = [
  '**/node_modules/**',
  '.agents/**',
  '.agent/**',
  '.codex/**',
  '.git/**',
  '.impeccable/**',
  'artifacts/**',
  'data/**',
  'bin/**',
  'docs/vendor/**',
];

export default {
  srcPath: '.',
  hints: false,
  prettier: {
    sources: [
      'server.mjs',
      'lib',
      'tests',
      'scripts',
      'hireos/dist',
      '*.json',
      '*.js',
      '.github/workflows',
      'README.md',
      'docs/*.md',
      'planning',
      'eval',
    ],
  },
  eslint: [
    { ignores: ignored },
    {
      template: 'qoq-eslint-v9-js',
      files: ['server.mjs', 'lib/**/*.mjs', 'tests/**/*.mjs', 'scripts/**/*.mjs', '*.config.js'],
      languageOptions: {
        globals: Object.fromEntries(
          ['process', 'Buffer', 'console', 'URL', 'crypto', 'fetch', 'setTimeout'].map((name) => [
            name,
            'readonly',
          ])
        ),
      },
    },
    {
      template: 'qoq-eslint-v9-js',
      files: ['hireos/dist/*.js'],
      languageOptions: {
        globals: Object.fromEntries(
          [
            'document',
            'window',
            'localStorage',
            'crypto',
            'fetch',
            'structuredClone',
            'setTimeout',
            'clearTimeout',
            'FormData',
            'Blob',
            'URL',
          ].map((name) => [name, 'readonly'])
        ),
      },
    },
  ],
  knip: {
    entry: [
      'server.mjs',
      'hireos/dist/app.js',
      'hireos/dist/login.js',
      'hireos/dist/apply.js',
      'tests/**/*.test.mjs',
      'scripts/*.mjs',
      'qoq.config.js',
      'eslint.config.js',
    ],
    project: [
      'server.mjs',
      'lib/**/*.mjs',
      'hireos/dist/*.js',
      'tests/**/*.mjs',
      'scripts/*.mjs',
      '*.config.js',
    ],
    ignore: ignored,
  },
  jscpd: {
    format: ['javascript', 'css'],
    ignore: ignored,
  },
};
