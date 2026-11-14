/* =========================================================================
   GEOLOGY — camada geológica de Marte (USGS SIM 3292) para o globo 3D.
   Arquivos esperados em assets/geology/:
     mars_geology_texture.png | mars_geology.geojson | mars_geology_units.json
   Depende de: THREE (global). Sem bibliotecas extras.

   Uso rápido:
     await Geology.load();
     Geology.attachOverlay(marsModel);              // marsModel = gltf.scene do globo
     Geology.setVisible(true/false); Geology.setOpacity(0.6);
     const info = Geology.describe(Geology.at(lat, lon));
   ========================================================================= */
const Geology = (() => {
    const BASE = 'assets/geology/';
    const MAP_W = 2048, MAP_H = 1024;
    let features = [], units = {}, idCtx = null, overlay = null, overlayTex = null;
    let loaded = false;

    /* ---------- carregar dados e montar mapa de IDs (lat/lon -> unidade) ---------- */
    async function load(base = BASE) {
        const [fc, list] = await Promise.all([
            fetch(base + 'mars_geology.geojson').then(r => r.json()),
            fetch(base + 'mars_geology_units.json').then(r => r.json())
        ]);
        list.forEach(u => units[u.unit] = u);
        // largest first: smaller polygons (islands inside bigger ones) are drawn on top
        features = fc.features.slice().sort((a, b) => b.properties.area_km2 - a.properties.area_km2);

        const c = document.createElement('canvas');
        c.width = MAP_W; c.height = MAP_H;
        idCtx = c.getContext('2d', { willReadFrequently: true });
        const px = (lon, lat) => [(lon + 180) / 360 * MAP_W, (90 - lat) / 180 * MAP_H];

        features.forEach((f, i) => {
            const id = i + 1;
            idCtx.fillStyle = `rgb(${id >> 8},${id & 255},0)`;
            const g = f.geometry;
            const polys = g.type === 'MultiPolygon' ? g.coordinates : [g.coordinates];
            polys.forEach(p => {
                idCtx.beginPath();
                p[0].forEach((q, k) => { const [x, y] = px(q[0], q[1]); k ? idCtx.lineTo(x, y) : idCtx.moveTo(x, y); });
                idCtx.closePath();
                idCtx.fill();
            });
        });
        loaded = true;
    }

    /* ---------- consulta: qual unidade existe em (lat, lon)? ---------- */
    function isReady() { return loaded; }
    function at(lat, lon) {
        if (!loaded) return null;
        lon = ((lon + 180) % 360 + 360) % 360 - 180;
        const x = Math.min(MAP_W - 1, Math.max(0, Math.floor((lon + 180) / 360 * MAP_W)));
        const y = Math.min(MAP_H - 1, Math.max(0, Math.floor((90 - lat) / 180 * MAP_H)));
        const d = idCtx.getImageData(x, y, 1, 1).data;
        const id = (d[0] << 8) | d[1];
        return id ? features[id - 1].properties : null;
    }

    // Se você pegar o ponto clicado com Raycaster, use o uv do hit (evita erro de orientação):
    //   const hit = raycaster.intersectObject(marsModel, true)[0];
    //   const props = Geology.atUV(hit.uv);
    function atUV(uv) { return at(uv.y * 180 - 90, uv.x * 360 - 180); }

    /* ---------- overlay: clona o seu modelo com a textura da geologia ---------- */
    function attachOverlay(model, { scale = 1.003, opacity = 0.65, url = BASE + 'mars_geology_texture.png' } = {}) {
        if (overlay) detach();
        overlayTex = new THREE.TextureLoader().load(url);
        overlayTex.encoding = THREE.sRGBEncoding;
        overlay = model.clone(true);
        overlay.traverse(o => {
            if (o.isMesh) {
                o.material = new THREE.MeshBasicMaterial({
                    map: overlayTex, transparent: true, opacity, depthWrite: false
                });
                o.renderOrder = 1;
            }
        });
        overlay.scale.multiplyScalar(scale);   // um pouco maior: evita z-fighting
        (model.parent || model).add(overlay);
        return overlay;
    }
    function detach() { if (overlay && overlay.parent) overlay.parent.remove(overlay); overlay = null; }
    function setVisible(v) { if (overlay) overlay.visible = v; }
    function setOpacity(a) { if (overlay) overlay.traverse(o => { if (o.isMesh) o.material.opacity = a; }); }

    /* ---------- interpretar o código da unidade ---------- */
    const PERIOD = {
        N: 'Noachian (>3.7 Gyr; liquid water likely)',
        H: 'Hesperian (~3.7-3.0 Gyr; volcanism and floods)',
        A: 'Amazonian (<3.0 Gyr; cold and dry)'
    };
    const EPOCH = { e: 'early', m: 'middle', l: 'late' };
    const KIND = {
        h: 'highlands', hm: 'highland massifs', hu: 'highlands (undivided)',
        l: 'lowland plains', v: 'volcanic', vf: 'volcanic field', ve: 'volcanic edifice',
        i: 'impact material (craters)', t: 'transition terrain', tu: 'transition (undivided)',
        to: 'outflow-channel deposits', b: 'basin', a: 'slope apron deposits',
        p: 'polar', pc: 'polar cap', pd: 'polar dunes', pe: 'polar edifice', pu: 'polar (undivided)',
        u: 'undivided'
    };

    function parseUnit(code) {
        const m = /^([eml]?)(AH|HN|AN|A|H|N)(.*)$/.exec(code || '');
        if (!m) return null;
        return { epoch: m[1], period: m[2], kind: m[3] };
    }

    function describe(props) {
        if (!props) return { title: 'No data', age: '', terrain: '' };
        const p = parseUnit(props.unit);
        if (!p) return { title: props.desc, text: props.unit };
        const periods = p.period.split('').map(c => PERIOD[c] ? PERIOD[c].split(' (')[0] : c).join(' / ');
        return {
            code: props.unit,
            title: props.desc,
            age: (p.epoch ? EPOCH[p.epoch] + ' ' : '') + periods,
            terrain: KIND[p.kind] || p.kind,
            area_km2: props.area_km2,
            color: units[props.unit] && units[props.unit].color
        };
    }

    /* ---------- perfil para o modo superfície (surface.js) ---------- */
    // Retorna parâmetros para ajustar relevo e quantidade de rochas conforme a geologia.
    function surfaceProfile(props) {
        const p = props && parseUnit(props.unit);
        const prof = { rocks: 160, relief: 1.0 };
        if (!p) return prof;
        switch (p.kind) {
            case 'l': case 'b': prof.rocks = 90; prof.relief = 0.5; break; // planície/bacia: liso
            case 'i': prof.rocks = 260; prof.relief = 1.2; break; // impacto: muita rocha
            case 'v': case 'vf': case 've': prof.rocks = 200; prof.relief = 0.9; break; // basalto
            case 'a': prof.rocks = 220; prof.relief = 1.4; break; // pé de encosta
            case 't': case 'tu': case 'to': prof.rocks = 180; prof.relief = 1.6; break; // transição/canais
            case 'pd': prof.rocks = 30; prof.relief = 0.8; break; // dunas
            case 'p': case 'pc': case 'pe': case 'pu': prof.rocks = 40; prof.relief = 0.4; break;
            case 'h': case 'hm': case 'hu': prof.rocks = 200; prof.relief = 1.1; break;
        }
        return prof;
    }

    return { load, isReady, at, atUV, attachOverlay, detach, setVisible, setOpacity, describe, surfaceProfile, parseUnit };
})();