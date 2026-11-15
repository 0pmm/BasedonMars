# Mars Explorer 3 · Mapa e rotas em Marte

Mapa marciano em camadas, montado com **dados reais da NASA**, para planejar uma caminhada em Marte
(EVA, ou "Marswalk") com segurança. Feito para o desafio
[Interplanetary Survival Guide: Martian Map](https://www.spaceappschallenge.org/2026/challenges/interplanetary-survival-guide-martian-map/)
do NASA Space Apps 2026.

O foco é mostrar Marte **como ele é**, no nível de uma caminhada: o relevo e as fotos reais de um local,
combinados com camadas térmicas, minerais, geológicas, de radiação e de clima. Sobre isso, a ferramenta
traça uma rota segura entre quaisquer pontos, calcula oxigênio, tempo, dose e ponto de não retorno, e deixa
percorrer a rota em primeira pessoa sobre o terreno real. A parte gamificada (missão guiada) foi retirada.

> Projeto educacional, **sem afiliação ou endosso da NASA**. Todos os dados vêm de serviços públicos da
> NASA consultados ao vivo. O que é calculado ou estimado pelo app está marcado assim na interface e
> explicado em [docs/METHODOLOGY.md](docs/METHODOLOGY.md).

## O que tem

Uma ferramenta só, em três passos: **olhar Marte inteiro → planejar uma rota entre quaisquer pontos →
percorrer a rota em primeira pessoa para testá-la.**

**1. Globo contínuo, do planeta ao chão**

- Terreno real em streaming, com nível de detalhe como no Google Earth: o globo vira o chão sem corte. Cada
  tile tem o relevo do NASA/JPL Mars Trek (MOLA/HRSC no planeta todo; DTMs CTX/HiRISE de até ~1 m nos
  locais de pouso) e a cor do mosaico Viking com o detalhe da imagem mais nítida disponível (HiRISE 25 cm,
  CTX 6 m, THEMIS-IR 100 m)
- Câmera estilo Google Earth: arrastar move o mapa, a roda aproxima no ponto do cursor, botão direito
  (ou Ctrl) gira e inclina perto do chão, duplo clique desce
- Camadas de instrumentos da NASA (THEMIS dia/noite, geologia USGS, MOLA, TES: inércia térmica, poeira,
  argilas, piroxênio, albedo, rugosidade) e camadas calculadas do relevo real na escala da vista
  (declividade, zonas proibidas, altitude, curvas de nível), com opacidade
- 14 locais importantes (com fotos da NASA), que podem ser mostrados ou escondidos; iluminação pelo ponto
  subsolar real; telemetria real de Jezero (Mars24, MEDA, RAD)

**2. Rota entre quaisquer pontos (aba "Rota")**

- Marque a base e as paradas clicando em qualquer lugar do globo, em qualquer zoom; arraste os marcadores
- Cada trecho é calculado numa grade do tamanho dele: um trecho de 300 m usa ~1,5 m de resolução (com os
  blocos detectados na HiRISE); um de 200 km usa centenas de metros. O A\* minimiza o tempo de caminhada
  e evita declives, rugosidade e blocos acima dos limites do traje
- Distância, duração, subida/descida, O₂, ponto de não retorno, pior tempo até a base, raio de alcance,
  % da rota com sinal de rádio (linha de visada da antena), % na sombra, dose e nota do plano; perfil
- A pé ou de rover, em dupla ou sozinho, hora solar local ajustável, premissas do traje editáveis
- Rotas salvas e comparadas, exportação GeoJSON e checklist

**3. Primeira pessoa ao longo da rota**

- O chão é carregado em blocos de 160 m em volta do caminhante: os blocos próximos ficam ativos, os
  seguintes carregam escondidos pela neblina e os distantes são descartados; os blocos à frente na rota
  são carregados primeiro. A rota pode ter qualquer comprimento
- Relevo real nos vértices de cada bloco, foto HiRISE/CTX tingida com a cor real do local e blocos de
  rocha reais onde a foto é nítida
- Modo "seguir" (anda sozinho pela rota na velocidade do modelo × fator de tempo de ×1 a ×200) e modo
  livre (WASD). Relógio da EVA, O₂, dose e posição do Sol avançam com o tempo da EVA
- Ao sair, o globo volta exatamente ao ponto onde você estava

**4. Objetivos científicos e guia de pouso**

- Três objetivos (vida antiga, história geológica, sobrevivência humana) com pesos e fontes visíveis em
  cada critério
- Ranking de 12 locais curados e de zonas candidatas descobertas nas detecções de minerais hidratados do
  CRISM/OMEGA, com selo de explorado/nunca visitado e de confiança
- "Planejar Marswalk": escolhe as paradas científicas do objetivo, monta a EVA (a pé ou de rover) e mostra
  a cobertura científica da rota
- Em zona não explorada, verifica a landabilidade ao vivo sobre o relevo real e propõe um ponto de base

## Como rodar

Requer [Node.js](https://nodejs.org/) 20.19+ (ou 22.12+) e internet (os dados vêm da NASA ao vivo).

```bash
npm install
```

```bash
npm run dev
```

Abra o endereço mostrado no terminal (normalmente http://localhost:5173).

Links diretos: `#site=delta-front` desce até um local sugerido; `#at=18.4446,77.4509` desce até qualquer
coordenada (latitude, longitude leste); `#poi=gale` abre um local do globo.

### Outros comandos

| Comando            | O que faz                                             |
| ------------------ | ----------------------------------------------------- |
| `npm run build`    | Gera a versão de produção em `dist/`                  |
| `npm run preview`  | Serve o `dist/` localmente (com CSP ativa)            |
| `npm test`         | Testes unitários (Vitest)                             |
| `npm run test:e2e` | Testes ponta a ponta no Chrome instalado (Playwright) |
| `npm run lint`     | ESLint                                                |
| `npm run format`   | Prettier                                              |
| `npm run check`    | Lint + formatação + testes + build                    |

## Como planejar uma rota

1. Em "Explorar Marte e planejar uma rota", aproxime o globo até o lugar (ou use um local sugerido).
2. Ative **Marcar pontos** e clique no terreno: o primeiro ponto é a base 🏠, os outros são paradas.
3. A rota aparece no globo e as métricas no painel. Arraste marcadores, mude o modo, a hora ou as premissas.
4. Salve, compare e exporte.
5. **Percorrer a rota em primeira pessoa** para testá-la.

## Controles

| Ação                        | Globo                                  | Primeira pessoa                     |
| --------------------------- | -------------------------------------- | ----------------------------------- |
| Mover                       | Arrastar · setas                       | WASD / setas (muda para modo livre) |
| Zoom / olhar                | Roda (no cursor) · pinça · + / −       | Mouse (clique para capturar)        |
| Girar e inclinar            | Botão direito ou Ctrl + arrastar · Q/E | —                                   |
| Seguir a rota / andar livre | —                                      | F (ou E)                            |
| Fator de tempo              | —                                      | [ e ]                               |
| Pausar / minimapa / foto    | —                                      | P · M · K                           |

No celular: um dedo move o mapa, pinça aproxima, dois dedos giram e inclinam; na primeira pessoa,
joystick à esquerda e arrastar à direita para olhar.

## Estrutura

```
index.html            Estrutura da interface
public/               Texturas do globo, ícones, PWA (service worker com cache dos tiles da NASA)
src/
  main.js             Inicialização, navegação entre estados e loop principal
  config.js           Constantes físicas e parâmetros
  geo/                Dados reais: geodésia de Marte, tiles do Mars Trek, decodificador de terreno,
                      alturas por tile, grade de altitude e análises, Mars24, feeds das missões
  orbit/              Globo: terreno em streaming (terrainGlobe), câmera (globeControls), rota no globo,
                      locais, satélites, atmosfera
  planner/            Modelos de planejamento: rota entre pontos, A*, modelo de EVA, detecção de blocos
  traverse/           Primeira pessoa: blocos de terreno (chunks), caminhada ao longo da rota, controle
  surface/            Peças da primeira pessoa: céu, jogador, rochas, poeira, texturas
  ui/                 Painel do globo, aba Rota, HUD, menus, diálogos, fontes e metodologia
  core/               Infraestrutura: eventos, estado, configurações, i18n, áudio, entrada, renderer
  data/               JSON: locais sugeridos, camadas da NASA, locais do globo, catálogo
  i18n/               Textos (en / pt)
  styles/             CSS por área
tests/unit/           Vitest (tiles, rota, EVA, chunks, geodésia, Mars24, feeds, traduções)
tests/e2e/            Playwright (zoom contínuo, rota, primeira pessoa, celular, configurações)
docs/                 ARCHITECTURE.md e METHODOLOGY.md
```

## Privacidade

Sem conta, sem cookies e sem rastreamento. Configurações, progresso e planos ficam no `localStorage`.
As requisições externas vão apenas para serviços públicos da NASA (trek.nasa.gov, o bucket de terreno do
Mars Trek, mars.nasa.gov, api.nasa.gov e images-api.nasa.gov).

## Licença

A definir pela equipe (ver [CREDITS.md](CREDITS.md) para as licenças dos recursos de terceiros).
