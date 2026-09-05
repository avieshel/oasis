import tseslint from 'typescript-eslint';

export default tseslint.config(
  ...tseslint.configs.recommendedTypeChecked,
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ['test/**/*.ts', 'vitest.config.ts'],
    languageOptions: {
      parserOptions: {
        project: './tsconfig.test.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    ignores: ['dist/', 'client/', 'node_modules/', 'prisma/'],
  },
);

