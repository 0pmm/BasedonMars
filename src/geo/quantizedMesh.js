/**
 * Decoder for Cesium "quantized-mesh-1.0" terrain tiles (pure).
 * Spec: https://github.com/CesiumGS/quantized-mesh
 *
 * Only the parts the app needs are decoded: vertex positions (u, v in
 * 0..32767 across the tile, height between minHeight and maxHeight) and
 * the triangle indices. Extensions (normals, water mask) are ignored.
 */

const HEADER_BYTES = 88;

function zigZagDeltaDecode(view, offset, count) {
  const out = new Uint16Array(count);
  let value = 0;
  for (let i = 0; i < count; i++) {
    const e = view.getUint16(offset + i * 2, true);
    value += (e >> 1) ^ -(e & 1);
    out[i] = value;
  }
  return out;
}

/**
 * @param {ArrayBuffer} buffer an already-decompressed tile
 * @returns {{minHeight:number, maxHeight:number, u:Uint16Array, v:Uint16Array, h:Uint16Array, indices:Uint16Array|Uint32Array}}
 */
export function decodeQuantizedMesh(buffer) {
  const view = new DataView(buffer);
  if (buffer.byteLength < HEADER_BYTES + 4) throw new Error('quantized-mesh: tile too small');
  const minHeight = view.getFloat32(24, true);
  const maxHeight = view.getFloat32(28, true);
  let pos = HEADER_BYTES;
  const vertexCount = view.getUint32(pos, true);
  pos += 4;
  const u = zigZagDeltaDecode(view, pos, vertexCount);
  pos += vertexCount * 2;
  const v = zigZagDeltaDecode(view, pos, vertexCount);
  pos += vertexCount * 2;
  const h = zigZagDeltaDecode(view, pos, vertexCount);
  pos += vertexCount * 2;

  const use32 = vertexCount > 65536;
  const bytes = use32 ? 4 : 2;
  if (pos % bytes) pos += bytes - (pos % bytes); // index data is aligned
  const triangleCount = view.getUint32(pos, true);
  pos += 4;
  const n = triangleCount * 3;
  const indices = use32 ? new Uint32Array(n) : new Uint16Array(n);
  // High-water-mark encoding
  let highest = 0;
  for (let i = 0; i < n; i++) {
    const code = use32 ? view.getUint32(pos + i * 4, true) : view.getUint16(pos + i * 2, true);
    indices[i] = highest - code;
    if (code === 0) highest++;
  }
  return { minHeight, maxHeight, u, v, h, indices };
}
