/**
 * Web Worker: generates the surface textures off the main thread so
 * loading a location never freezes the UI.
 */
import { generateGround, generateRock } from './textureGen.js';

self.onmessage = (e) => {
  const { id, kind, size, seed } = e.data;
  const out = kind === 'rock' ? generateRock(size) : generateGround(size, seed);
  self.postMessage({ id, ...out }, [out.color.buffer, out.bump.buffer]);
};
