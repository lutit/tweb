import {defineConfig} from 'vitest/config';
import solidPlugin from 'vite-plugin-solid';
import handlebars from 'vite-plugin-handlebars';
import basicSsl from '@vitejs/plugin-basic-ssl';
import {visualizer} from 'rollup-plugin-visualizer';
import checker from 'vite-plugin-checker';
// import devtools from 'solid-devtools/vite'
import autoprefixer from 'autoprefixer';
import {resolve} from 'path';
import {existsSync, copyFileSync} from 'fs';
import {ServerOptions} from 'vite';
import {watchLangFile} from './watch-lang.js';
import path from 'path';

const rootDir = resolve(__dirname);
const ENV_LOCAL_FILE_PATH = path.join(rootDir, '.env.local');
const ENV_LOCAL_EXAMPLE_PATH = path.join(rootDir, '.env.local.example');

const ensureLocalEnv = () => {
  if(!existsSync(ENV_LOCAL_FILE_PATH) && existsSync(ENV_LOCAL_EXAMPLE_PATH)) {
    copyFileSync(ENV_LOCAL_EXAMPLE_PATH, ENV_LOCAL_FILE_PATH);
  }
};

const handlebarsPlugin = handlebars({
  context: {
    title: 'Telegram Web',
    description: 'Telegram is a cloud-based mobile and desktop messaging app with a focus on security and speed.',
    url: 'https://web.telegram.org/k/',
    origin: 'https://web.telegram.org/'
  }
});

const serverOptions: ServerOptions = {
  // host: '192.168.95.17',
  port: 8080,
  sourcemapIgnoreList(sourcePath, sourcemapPath) {
    return sourcePath.includes('node_modules') ||
      sourcePath.includes('logger') ||
      sourcePath.includes('eventListenerBase');
  }
};

const SOLID_SRC_PATH = 'src/solid/packages/solid';
const SOLID_BUILT_PATH = 'src/vendor/solid';
const USE_SOLID_SRC = false;
const SOLID_PATH = USE_SOLID_SRC ? SOLID_SRC_PATH : SOLID_BUILT_PATH;
const USE_OWN_SOLID = existsSync(resolve(rootDir, SOLID_PATH));

const USE_SSL = false;
const USE_SSL_CERTS = false;
const NO_MINIFY = false;
const SSL_CONFIG: any = USE_SSL_CERTS && USE_SSL && {
  name: '192.168.95.17',
  certDir: './certs/'
};

const ADDITIONAL_ALIASES = {
  'solid-transition-group': resolve(rootDir, 'src/vendor/solid-transition-group')
};

if(USE_OWN_SOLID) {
  console.log('using own solid', SOLID_PATH, 'built', !USE_SOLID_SRC);
} else {
  console.log('using original solid');
}

const ALWAYS_PREFETCH_DEPS = [
  '@solid-primitives/refs',
  '@solid-primitives/transition-group',
  'big-integer',
  'fast-png',
  'hls.js',
  'js-md5',
  'mp4-muxer',
  'pako',
  'qr-code-styling',
  'tinyld'
];

const shouldEnableLangWatch = () => {
  const flag = process.env.TWEB_LANG_WATCH || process.env.VITE_LANG_WATCH;
  return flag === '1' || flag === 'true';
};

const shouldEnableChecker = (isServe: boolean) => {
  const flag = process.env.VITE_CHECKER || process.env.TWEB_CHECKER;
  if(flag) {
    return flag === '1' || flag === 'true';
  }

  return !isServe;
};

const shouldEnableAnalyzer = () => {
  const flag = process.env.BUNDLE_ANALYZE || process.env.ANALYZE || process.env.VITE_ANALYZE;
  return flag === '1' || flag === 'true';
};

const shouldKeepDevCssSourceMaps = () => {
  const flag = process.env.VITE_CSS_SOURCEMAPS;
  if(typeof flag === 'string') {
    return flag === '1' || flag === 'true';
  }

  return false;
};

export default defineConfig(({command}) => {
  const isServe = command === 'serve';
  const enableLangWatch = isServe && shouldEnableLangWatch();
  const enableChecker = shouldEnableChecker(isServe) && !process.env.VITEST;
  const enableAnalyzer = shouldEnableAnalyzer();

  if(isServe) {
    ensureLocalEnv();
    if(enableLangWatch) {
      watchLangFile();
    }
  }

  return {
    plugins: [
      enableChecker ? checker({
        typescript: true,
        eslint: {
          lintCommand: 'eslint "./src/**/*.{ts,tsx}" --ignore-pattern "/src/solid/*"',
          useFlatConfig: true
        }
      }) : undefined,
      solidPlugin({
        hot: isServe,
        dev: isServe
      }),
      handlebarsPlugin as any,
      USE_SSL ? (basicSsl as any)(SSL_CONFIG) : undefined,
      enableAnalyzer ? visualizer({
        gzipSize: true,
        template: 'treemap',
        filename: 'stats.html'
      }) : undefined
    ].filter(Boolean),
    test: {
      exclude: [
        '**/node_modules/**',
        '**/dist/**',
        '**/cypress/**',
        '**/.{idea,git,cache,output,temp}/**',
        '**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build}.config.*',
        '**/solid/**'
      ],
      environment: 'jsdom',
      testTransformMode: {web: ['.[jt]sx?$']},
      threads: false,
      isolate: false,
      globals: true,
      setupFiles: ['./src/tests/setup.ts']
    },
    server: {
      ...serverOptions,
      watch: {
        awaitWriteFinish: {
          stabilityThreshold: 200,
          pollInterval: 100
        }
      }
    },
    base: '',
    optimizeDeps: {
      include: ALWAYS_PREFETCH_DEPS,
      esbuildOptions: {
        target: 'es2022',
        supported: {
          'top-level-await': true
        }
      }
    },
    build: {
      target: 'es2020',
      sourcemap: true,
      assetsDir: '',
      copyPublicDir: false,
      emptyOutDir: true,
      minify: NO_MINIFY ? false : undefined,
      reportCompressedSize: false,
      rollupOptions: {
        output: {
          sourcemapIgnoreList: serverOptions.sourcemapIgnoreList
        }
      }
    },
    worker: {
      format: 'es'
    },
    css: {
      devSourcemap: shouldKeepDevCssSourceMaps(),
      postcss: {
        plugins: [
          autoprefixer({})
        ]
      }
    },
    resolve: {
      alias: USE_OWN_SOLID ? {
        'rxcore': resolve(rootDir, SOLID_PATH, 'web/core'),
        'solid-js/jsx-runtime': resolve(rootDir, SOLID_PATH, 'jsx'),
        'solid-js/web': resolve(rootDir, SOLID_PATH, 'web'),
        'solid-js/store': resolve(rootDir, SOLID_PATH, 'store'),
        'solid-js': resolve(rootDir, SOLID_PATH),
        ...ADDITIONAL_ALIASES
      } : ADDITIONAL_ALIASES
    }
  };
});
