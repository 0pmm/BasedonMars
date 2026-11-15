import { defineConfig } from 'vite';

/**
 * Content-Security-Policy for production builds. Not applied in dev
 * because Vite's HMR client needs inline styles and a websocket.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'", // wasm: Draco mesh decoder
  "style-src 'self' 'unsafe-inline'", // inline style attributes set by the UI
  "img-src 'self' data: blob: https://*.nasa.gov",
  // blob: GLB textures · NASA services queried live: Mars Trek tiles/terrain, mission feeds, DONKI
  "connect-src 'self' blob: data: https://images-api.nasa.gov https://trek.nasa.gov https://marshub.s3.amazonaws.com https://mars.nasa.gov https://api.nasa.gov",
  "font-src 'self' data:",
  "worker-src 'self' blob:",
  "media-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ');

function cspPlugin() {
  return {
    name: 'mars-explorer-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '<meta charset="UTF-8" />',
        `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`
      );
    },
  };
}

const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'X-Frame-Options': 'DENY',
};

export default defineConfig({
  base: './', // relative paths: works on GitHub Pages sub-folders and any static host
  plugins: [cspPlugin()],
  server: { port: 5173, headers: securityHeaders },
  preview: { port: 4173, headers: { ...securityHeaders, 'Content-Security-Policy': CSP } },
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: (id) => (id.includes('node_modules/three') ? 'three' : undefined),
      },
    },
  },
  test: {
    include: ['tests/unit/**/*.test.js'],
    environment: 'node',
  },
});
