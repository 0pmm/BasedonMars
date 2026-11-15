# Créditos

## Dados e imagens

- **Relevo e imagens orbitais**: [NASA/JPL Mars Trek](https://trek.nasa.gov/mars/) (Solar System Treks Project),
  lidos ao vivo: malhas de terreno, HiRISE e CTX (MRO), THEMIS (Mars Odyssey), TES e MOLA (Mars Global Surveyor),
  HRSC (Mars Express), mapa geológico SIM 3292 (USGS), detecções CRISM/OMEGA. Créditos: NASA/JPL-Caltech/
  University of Arizona (HiRISE), NASA/JPL-Caltech/MSSS (CTX), NASA/JPL-Caltech/ASU (THEMIS), USGS.
- **Trilha, waypoints e fotos brutas da Perseverance**: NASA/JPL-Caltech (MMGIS e raw images).
- **Clima**: estação MEDA da Perseverance (NASA/JPL-Caltech/CAB). **Clima espacial**: NASA DONKI (CCMC).
- **Algoritmo Mars24**: NASA Goddard Institute for Space Studies (Allison & McEwen, 2000).
- **Waypoints da Curiosity** usados para posicionar o local do boxwork: NASA/JPL-Caltech (MMGIS).

- **Fotos dos locais**: [NASA Image and Video Library](https://images.nasa.gov/), buscadas em tempo
  real pela API pública `images-api.nasa.gov`. Cada foto mostra o título original e um link para a página da NASA.
  Imagens da NASA em geral não têm direitos autorais, mas o uso do nome e dos logotipos da NASA segue as
  [diretrizes de mídia da NASA](https://www.nasa.gov/nasa-brand-center/images-and-media/).
- **Coordenadas e fatos** dos locais: páginas de missões da NASA e Wikipedia (links em cada local).
- **Constantes físicas**: NASA Mars Fact Sheet (raio, gravidade, inclinação, duração do sol).
- **Dose de radiação de referência** (0,64 mSv/dia): instrumento RAD do rover Curiosity (Hassler et al., Science, 2014).

## Recursos 3D e texturas

| Arquivo                                      | Origem                                                                                                                                                                                                   | Licença          |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| `public/assets/textures/mars_*k.webp`        | Convertido do `mars_color.jpg` original do projeto (8192×4096). **Origem a confirmar pela equipe**: o tamanho coincide com a textura 8K de Mars da Solar System Scope (CC BY 4.0), que exige atribuição. | A confirmar      |
| `public/assets/textures/mars_detail_2k.webp` | Derivado da textura acima (realce de detalhes); não é elevação medida.                                                                                                                                   | Mesma da textura |

## Software

- [Three.js](https://threejs.org/) (MIT)
- Fontes Orbitron, Rajdhani e Share Tech Mono via [Fontsource](https://fontsource.org/) (SIL Open Font License)
- Ferramentas de desenvolvimento: Vite, Vitest, Playwright, ESLint, Prettier (MIT / Apache-2.0)

## Autores

Alisson, Caio Emanoel e Lucas Carvalho (ver histórico do git).
