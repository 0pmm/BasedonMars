# Fontes e metodologia

Este documento explica de onde vem cada dado, o que o app calcula e o que é estimativa.
A mesma informação aparece no app em **📚 Fontes e metodologia**.

## Dados (consultados ao vivo)

| Dado                                                            | Serviço                                                  | Resolução                                                 | Tipo                                |
| --------------------------------------------------------------- | -------------------------------------------------------- | --------------------------------------------------------- | ----------------------------------- |
| Relevo (malhas quantized-mesh)                                  | NASA/JPL Mars Trek (`marshub.s3.amazonaws.com/mars_v14`) | ~1 m em Jezero e Gusev; ~40 m em Gale; 200–460 m no resto | medido (DTMs CTX/HiRISE, MOLA/HRSC) |
| Foto HiRISE de Jezero                                           | Mars Trek `JEZ_hirise_soc_006_orthoMosaic_25cm…`         | 25 cm/px                                                  | medido                              |
| Foto CTX de Jezero / Gale                                       | Mars Trek                                                | 6 m/px                                                    | medido                              |
| Mosaico HiRISE/CTX/HRSC das Columbia Hills                      | Mars Trek                                                | 25 cm–6 m/px                                              | medido                              |
| THEMIS infravermelho dia e noite                                | Mars Trek (Mars Odyssey)                                 | 100 m/px                                                  | medido                              |
| Inércia térmica, poeira, argilas/vidro, piroxênio, albedo (TES) | Mars Trek (Mars Global Surveyor)                         | ~3–7 km/px                                                | medido                              |
| Topografia MOLA e MOLA+HRSC                                     | Mars Trek                                                | 200–463 m/px                                              | medido                              |
| Rugosidade MOLA                                                 | Mars Trek                                                | ~3 km/px                                                  | medido                              |
| Mapa geológico SIM 3292                                         | USGS via Mars Trek                                       | 1:20 000 000                                              | interpretado                        |
| Minerais hidratados                                             | CRISM/OMEGA via Mars Trek (feature service)              | pontos                                                    | medido/interpretado                 |
| Trilha e waypoints da Perseverance                              | NASA/JPL MMGIS                                           | por drive                                                 | medido                              |
| Fotos brutas da Perseverance                                    | API de raw images do mars.nasa.gov                       | —                                                         | medido                              |
| Clima MEDA                                                      | Relatório de clima do mars.nasa.gov                      | por sol                                                   | medido                              |
| Clima espacial                                                  | NASA DONKI (SEP e explosões M/X, últimos 30 dias)        | eventos                                                   | medido                              |

## Como o app calcula

- **Grade de altitude**: cada triângulo das malhas do Mars Trek é rasterizado numa grade regular
  (320×320 no planejador, 400×400 na primeira pessoa). As alturas dos tiles estão sobre uma esfera de
  referência; subtraímos uma constante (8205 m) calibrada no waypoint de pouso da Perseverance
  (−2569,9 m) e conferida nos pousos do Spirit e da Curiosity (±10 m).
- **Declividade**: diferenças centrais na grade. **Rugosidade**: desvio-padrão do resíduo em relação a um
  plano ajustado numa janela 5×5 (uma encosta lisa não conta como rugosa).
- **Rota**: A\* em 8 direções minimizando o **tempo** de caminhada pela função de Tobler, com penalidade
  por rugosidade e bloqueio onde a declividade ou a rugosidade passam do limite ou há bloco grande.
- **EVA**: velocidade no plano 0,9 m/s; taxa metabólica 420 W andando, +35 W por grau de subida, 300 W
  parado; O₂ ≈ 0,247 g por W·h; autonomia de 8 h a 300 W; reserva de 20%. Todos editáveis.
- **Ponto de não retorno**: o ponto mais distante da ida em que ida + volta pelo mesmo caminho ainda
  cabem no O₂ utilizável.
- **Pior tempo até a base**: o maior tempo, ao longo da rota, para voltar à base (alvo: ≤ 30 min para
  buscar abrigo num alerta de partículas solares).
- **Sol e tempo**: algoritmo Mars24 (Allison & McEwen 2000), conferido com o exemplo publicado e com o sol
  da missão Perseverance.
- **Sombras**: raio do Sol percorrido sobre a grade. **Sinal de rádio**: linha de visada desde a antena.
- **Radiação**: 0,64 mSv/dia (RAD, Hassler et al. 2014), +3% por km acima de −4,5 km.
  **Pressão**: 610 Pa × e^(−altitude/11,1 km) com variação sazonal de ±8% (estimativa).
- **Blocos**: pixels muito mais escuros que a vizinhança na foto HiRISE (sombras), agrupados; diâmetro
  estimado pela área. É uma versão simplificada das contagens automáticas usadas na escolha de locais de pouso.
- **Nota do plano**: segurança (O₂, declividade, sinal, dose, dupla), ciência (paradas científicas),
  eficiência (rota real ÷ linha reta).
- **Ensaio em primeira pessoa**: o movimento é acelerado (~4,7×), mas o O₂ é gasto no "tempo de EVA
  equivalente", então o medidor reflete o plano real.

## Globo contínuo (versão 3.1)

- **Tiles**: o globo é uma árvore de tiles na grade geográfica do Mars Trek (nível z: 2^(z+1) × 2^z). Cada
  tile é uma grade de 33×33 vértices com as alturas do tile de relevo mais fino disponível (ou do ancestral
  mais próximo, re-amostrado). Um tile é dividido enquanto um texel cobre mais de ~1,4 pixel na tela.
- **Cor e detalhe**: a cor vem do mosaico Viking MDIM 2.1 (até o nível 7, ~232 m/px). Como as cores do
  Viking são aproximadas (basaltos escuros ficam roxo-acinzentados), o matiz é puxado 55% para a cor do solo
  das fotos dos rovers, mantendo o padrão de claro/escuro real. O detalhe vem da imagem em tons de cinza
  mais nítida que cobre o tile (HiRISE 25 cm, CTX 6 m, THEMIS-IR 100 m): o brilho dela modula a cor
  ("pan-sharpening"). A cor é, portanto, **aproximada**; as formas e o claro/escuro são reais.
- **Camadas calculadas no globo**: declividade e altitude vêm das alturas de cada tile, na resolução da vista
  (de longe, uma encosta aparece mais suave do que é; aproxime para ver o valor real).

## Rota entre quaisquer pontos

- Cada trecho (ponto → ponto) é calculado numa grade própria, centrada nele e do tamanho dele
  (lado ≈ 1,35 × comprimento + 240 m, 200–400 células). Trechos curtos ficam com ~1,5 m por célula (com os
  blocos detectados na HiRISE); trechos longos, com centenas de metros. Trechos acima de 800 km pedem pontos
  intermediários.
- A cobertura de rádio usa uma grade centrada na base (até 40 km de lado).

## Primeira pessoa por blocos

- O chão é dividido em blocos de 160 m (vértices a cada 2 m) no referencial local do início da rota. Blocos a
  até ~2,6 blocos de distância ficam ativos; até ~3,6 carregam (dentro da neblina); além de ~4,6 são
  descartados. A neblina fecha antes do raio garantido, então a chegada de um bloco não aparece.
- Cada bloco recebe as alturas reais nos seus vértices (bordas idênticas às dos vizinhos), a foto HiRISE/CTX
  que o cobre (tingida com a cor do Viking no local, corrigida como no globo) e, onde a foto tem ≤ 1,2 m/px,
  os blocos de rocha detectados. Sem foto nítida, usa-se uma textura genérica de solo na cor real.
- No modo "seguir", a velocidade é a do modelo de EVA (Tobler ou rover) × o fator de tempo, limitada a
  60 m/s para o terreno conseguir carregar; o relógio da EVA, o O₂ e a dose seguem o modelo da rota.

## Realismo da primeira pessoa

- **Tempo real**: por padrão o ensaio corre a ×1. A caminhada usa a velocidade do modelo (Tobler ou rover) e
  cada parada dura os minutos planejados; o relógio da EVA, o O₂ (taxa metabólica andando ou parado) e a dose
  são integrados nesse tempo, então o ensaio termina com o mesmo tempo do plano. ⏩/⏪ mudam o fator
  (×1 a ×120); Espaço pula o trabalho de uma parada, mas o tempo dela continua contando.
- **Horizonte**: além dos blocos detalhados há dois anéis de terreno real: um de 3,2 km (vértices a cada 20 m,
  imagem HiRISE/CTX) e um de 40 km (vértices a cada 200 m, CTX/THEMIS/Viking). Cada anel é escondido onde uma
  camada mais fina já está pronta. O chão desce d²/2R (curvatura de Marte, ~60 m a 20 km).
- **Atmosfera**: a profundidade óptica da poeira (τ) é uma climatologia por estação para Jezero
  (~0,42 perto do afélio, até ~0,9 na estação de poeira, Ls ~255°). Ela define a névoa (distância ≈ 9 km/τ)
  e divide a luz do Sol entre direta (e^(−τ/sen elevação)) e difusa do céu. **Estimativa, não previsão.**
- **Temperatura do ar**: interpolada entre a mínima e a máxima do último sol publicado pelo MEDA, com o mínimo
  perto do nascer do sol e o máximo no começo da tarde. **Estimativa.**
- **Rochas**: os blocos visíveis na HiRISE vêm das sombras detectadas; as pedras menores que um pixel não são
  vistas de órbita, então são extrapoladas com uma lei de potência (muito mais pedras pequenas que grandes,
  como nos modelos de Golombek & Rapp usados na escolha de locais de pouso), com a quantidade proporcional aos
  blocos detectados no local. **Estimativa.**
- **Trilha da Perseverance**: em Jezero, as marcas das rodas seguem o traverse real do rover (NASA/JPL MMGIS).

## Limitações

- Altitudes absolutas são aproximadas (±100 m longe do equador); as diferenças de altura são as do modelo.
- Não há mapa público de gelo subterrâneo nem previsão do Mars Climate Database no Mars Trek; a estação de
  tempestades de poeira é indicada pela longitude solar (Ls 180°–330°).
- As camadas globais do TES (~3 km/px) servem de contexto, não para decidir passos.
- Fotos HiRISE e CTX são em tons de cinza; a cor "marciana" do terreno é uma aproximação e pode ser desligada.
- Avaliamos trocar o Three.js pelo CesiumJS (que tem Marte 3D com dados da NASA/JPL), mas ele exige conta e
  token do Cesium ion; optamos por ler os mesmos tiles do Mars Trek diretamente, sem conta.
