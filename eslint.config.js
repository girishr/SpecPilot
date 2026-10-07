const js = require('@eslint/js');
const tsPlugin = require('@typescript-eslint/eslint-plugin');
const tsParser = require('@typescript-eslint/parser');

module.exports = [
    js.configs.recommended,
    {
        files: ['src/**/*.ts'],
        languageOptions: {
            parser: tsParser,
            parserOptions: {
                ecmaVersion: 2020,
                sourceType: 'module',
            },
        },
        plugins: {
            '@typescript-eslint': tsPlugin,
        },
        rules: {
            // TypeScript-specific rules
            '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
            '@typescript-eslint/no-explicit-any': 'warn',
            '@typescript-eslint/no-var-requires': 'warn',
            // Disable base rule in favour of TS-aware version
            'no-unused-vars': 'off',
            'no-console': 'off',
            'no-undef': 'off', // TypeScript handles this
        },
    },
    {
        // The spec core is pure (BL-032, REQ-002.I.2): it may import only handlebars and files beside it.
        files: ['src/core/**/*.ts'],
        rules: {
            'no-restricted-imports': ['error', {
                patterns: [{
                    group: ['fs', 'path', 'os', 'crypto', 'child_process', 'util', 'http', 'https', 'net', 'node:*', '../*'],
                    message: 'src/core is pure: it may import only handlebars and files beside it (REQ-002.I.2).',
                }],
            }],
            'no-restricted-globals': ['error', 'process', 'Buffer', '__dirname', '__filename', 'require'],
        },
    },
];
