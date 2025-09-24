import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import terser from '@rollup/plugin-terser';
import copy from 'rollup-plugin-copy';
import replace from '@rollup/plugin-replace'; // Add this import

const basePlugins = [
  resolve({ browser: true }),
  commonjs({ strictRequires: false }),
  replace({
    'process.env.NODE_ENV': JSON.stringify('production'), // Shim process.env.NODE_ENV
    preventAssignment: true, // Prevent accidental assignment to process.env
  }),
  terser({
    mangle: false, // Disable mangling to avoid issues
    compress: {
      drop_console: false, // Keep console logs for debugging
    },
  }),
];

const copyPlugin = copy({
  targets: [
    { src: 'manifest.json', dest: 'dist' },
    { src: 'icons/**/*', dest: 'dist/icons' },
    { src: 'sidebar/**/*', dest: 'dist/sidebar' },
    { src: '_locales/**/*', dest: 'dist/_locales' },
    { src: 'src/common/alert-override.js', dest: 'dist' }, // Explicitly copy alert-override.js
    { src: 'src/common/network.js', dest: 'dist' }, // Explicitly copy network.js
  ],
});

const onwarn = (warning, warn) => {
  if (warning.code === 'THIS_IS_UNDEFINED') return;
  warn(warning);
};

const makeConfig = (name, input) => ({
  input,
  output: {
    dir: 'dist',
    format: 'iife',
    entryFileNames: `${name}.bundle.js`,
    sourcemap: true,
  },
  plugins: [...basePlugins, copyPlugin], // Apply copyPlugin to all bundles
  onwarn,
});

export default [
  makeConfig('background', 'src/background/index.js'),
  makeConfig('content', 'src/content/index.js'),
  makeConfig('playback', 'src/playback/index.js'),
];