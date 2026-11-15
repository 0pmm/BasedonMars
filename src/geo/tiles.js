/**
 * Tile math for the two NASA Mars Trek services used by the app (pure).
 *
 * - Imagery (WMTS, EPSG:104905 geographic): level z has 2^(z+1) × 2^z
 *   tiles of 256 px, origin at (-180°, 90°), rows grow southwards.
 * - Terrain (quantized-mesh-1.0, TMS geographic): same grid but rows grow
 *   northwards from -90°.
 */

export const TREK_TILES = 'https://trek.nasa.gov/tiles/Mars/EQ';
export const TREK_TERRAIN = 'https://marshub.s3.amazonaws.com/mars_v14';
export const TILE_PX = 256;

/** Size of one tile in degrees at a level. */
export function tileDeg(z) {
  return 180 / 2 ** z;
}

/** Ground resolution (m/px) of a 256-px imagery tile at a level, at the equator. */
export function metresPerPixel(z) {
  return (tileDeg(z) * 3396190 * Math.PI) / 180 / TILE_PX;
}

/** WMTS tile URL. */
export function imageryTileUrl(layer, z, row, col, ext = 'png') {
  return `${TREK_TILES}/${layer}/1.0.0/default/default028mm/${z}/${row}/${col}.${ext}`;
}

/** Quantized-mesh terrain tile URL. */
export function terrainTileUrl(z, x, y) {
  return `${TREK_TERRAIN}/${z}/${x}/${y}.terrain?v=2.0`;
}

/**
 * Imagery tiles (row/col) covering a bbox at level z.
 * @param {{west:number,east:number,south:number,north:number}} bbox
 */
export function imageryTileRange(bbox, z) {
  const d = tileDeg(z);
  const cols = 2 ** (z + 1);
  const rows = 2 ** z;
  const c0 = Math.max(0, Math.floor((bbox.west + 180) / d));
  const c1 = Math.min(cols - 1, Math.floor((bbox.east + 180) / d - 1e-9));
  const r0 = Math.max(0, Math.floor((90 - bbox.north) / d));
  const r1 = Math.min(rows - 1, Math.floor((90 - bbox.south) / d - 1e-9));
  return {
    c0,
    c1,
    r0,
    r1,
    // geographic extent of the covered tiles
    west: c0 * d - 180,
    east: (c1 + 1) * d - 180,
    north: 90 - r0 * d,
    south: 90 - (r1 + 1) * d,
  };
}

/** Terrain tiles (x/y TMS) covering a bbox at level z. */
export function terrainTileRange(bbox, z) {
  const d = tileDeg(z);
  const x0 = Math.max(0, Math.floor((bbox.west + 180) / d));
  const x1 = Math.min(2 ** (z + 1) - 1, Math.floor((bbox.east + 180) / d - 1e-9));
  const y0 = Math.max(0, Math.floor((bbox.south + 90) / d));
  const y1 = Math.min(2 ** z - 1, Math.floor((bbox.north + 90) / d - 1e-9));
  return { x0, x1, y0, y1 };
}

/** Geographic bounds of a terrain tile. */
export function terrainTileBounds(z, x, y) {
  const d = tileDeg(z);
  return { west: x * d - 180, east: (x + 1) * d - 180, south: y * d - 90, north: (y + 1) * d - 90 };
}

/**
 * Highest terrain level available at a point, using the tileset's
 * `available` ranges from layer.json.
 * @param {Array<Array<{startX:number,endX:number,startY:number,endY:number}>>} available
 */
export function maxTerrainLevelAt(available, lat, lon) {
  let best = 0;
  for (let z = 0; z < available.length; z++) {
    const d = tileDeg(z);
    const x = Math.floor((lon + 180) / d);
    const y = Math.floor((lat + 90) / d);
    if (available[z].some((r) => x >= r.startX && x <= r.endX && y >= r.startY && y <= r.endY)) best = z;
  }
  return best;
}
