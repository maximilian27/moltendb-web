import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig({
  plugins: [
    dts({ include: ['src'], insertTypesEntry: true }),
  ],
  build: {
    lib: {
      entry: 'src/index.ts',
      name: 'MoltenDbReact',
      formats: ['es', 'cjs'],
      fileName: (format) => format === 'cjs' ? 'index.cjs' : 'index.js',
    },
    rollupOptions: {
      external: ['react', 'react/jsx-runtime', '@moltendb-web/core', '@moltendb-web/query'],
      output: {
        globals: {
          react: 'React',
        },
      },
    },
  },
});
