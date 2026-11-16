# Changelog

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/).

## [3.3.0] — não publicado

Integração com a branch `feat/guia-objetivos` e nova identidade visual.

### Adicionado

- **Tour com o GENIE** na tela inicial: 8 passos curtos que mostram o app inteiro, com o resto da tela desfocado
- **Local recomendado**: o passo Local mostra só a melhor escolha para o objetivo, com os motivos em linguagem
  simples e os pontos de atenção; "Trocar" abre uma janela sobre a tela desfocada com todas as opções e filtros
  ("Destacar por": geral ou cada critério). O mesmo vale para as zonas
- GENIE em mais lugares: aptidão, cada critério do local, filtros, zonas, verificação de pouso, objetivo, camadas
  e comparação de perfis de rota
- Objetivos de exploração (História geológica e Sobrevivência humana) com ranking de locais,
  zonas de minerais hidratados e plano automático de Marswalk (vindos da branch `feat/guia-objetivos`)
- **Exploração livre**: quarta opção, sem objetivo científico, que leva direto ao mapa para marcar qualquer rota
- Comparação dos três perfis de rota no painel e no mapa (linhas alternativas)
- Conjunto de ícones de linha próprio (sem emojis) e tipografia IBM Plex Sans / Condensed / Mono

### Corrigido

- Quando nenhum caminho cabia inteiro dentro do limite de declive (paredes de cânion, borda de cratera), o trecho
  era desenhado em **linha reta** por cima do relevo. Agora a rota contorna tudo o que dá e, se ainda precisar,
  cruza só o menor e mais suave trecho possível, marcado em vermelho no mapa e explicado no painel
- O limite de rugosidade (0,6 m, pensado para pedras em grade de ~1 m) bloqueava regiões inteiras em trechos
  longos (grade de dezenas a centenas de metros). Agora ele acompanha o tamanho da célula; o declive continua
  sendo verificado em toda escala
- A simplificação final da rota podia cortar cantos por dentro de terreno proibido; agora são usados os pontos
  já verificados
- Nomes das camadas apareciam com "undefined" na frente

### Removido

- Objetivo "Vida antiga" (as missões que o tinham continuam com esse registro histórico)

### Alterado

- Rotas: perfis Rápido, Equilibrado e Seguro com regras de perigo próprias (limite efetivo, margem de terreno
  proibido, início do risco), A\* em 16 direções e endireitamento do caminho — rotas diferentes entre si,
  desvios mais curtos e curvas mais naturais
- Tela do mapa reorganizada: barra superior fina com objetivo e telemetria em uma linha, ferramentas em um trilho
  à esquerda, camadas em um painel que abre sob demanda, legenda e coordenadas junto ao mapa, guia à direita com
  etapas numeradas e listas com divisórias em vez de cartões
- Tela inicial alinhada à esquerda com o globo à direita; rótulos do globo em estilo de instrumento

## [3.2.0] — não publicado

### Adicionado

- GENIE, o robô assistente: botões "?" ao lado dos indicadores (rota, ambiente, camadas, telemetria e capacete);
  ao clicar, o resto da tela fica desfocado, o indicador ganha destaque e o GENIE explica com os valores atuais
- Prioridade da rota (Segurança, Equilíbrio, Rapidez) e o quadro "Por que esta rota?", comparando com a linha reta
- Custo da rota com esforço (O₂ na subida) e risco: declive perto do limite, rugosidade, rochas, solo solto
  (THEMIS noite), rádio com a base e sombra

### Corrigido

- A rota passava por cima de morros em vez de contorná-los (custo só de tempo e área de busca estreita)
- A declividade sumia ao afastar o zoom (agora vem dos triângulos da malha da NASA, com o máximo por pixel)
- A linha da rota podia ficar enterrada sob o relevo menos detalhado ao afastar o zoom

## [3.1.0] — não publicado

Uma ferramenta só: **olhar Marte inteiro, planejar uma rota entre quaisquer pontos e percorrê-la em primeira pessoa**.

### Adicionado

- Globo com terreno real em streaming (nível de detalhe, como no Google Earth): do planeta inteiro até o chão
  sem corte. Relevo do Mars Trek em cada tile; cor do Viking MDIM 2.1 com o detalhe da imagem mais nítida
  disponível (HiRISE 25 cm, CTX 6 m, THEMIS-IR 100 m)
- Câmera estilo Google Earth: zoom no ponto do cursor, girar e inclinar perto do chão, voo entre locais
- Planejamento de rota dentro do globo (aba "Rota"): marcar base e paradas em qualquer ponto, arrastar
  marcadores, rota calculada por trecho na melhor resolução que cabe (de ~1,5 m a centenas de metros)
- Camadas calculadas no próprio globo a partir do relevo real: declividade, zonas proibidas, altitude e
  curvas de nível (na escala da vista)
- Primeira pessoa que segue a rota planejada, com o chão carregado em blocos ("chunks") em volta do
  caminhante: blocos ativos, blocos carregando escondidos pela neblina e blocos descartados; relógio da EVA,
  O₂, dose e Sol avançando com o tempo da EVA; fator de tempo ×1 a ×200; modo livre
- Ao sair da primeira pessoa, o globo volta exatamente ao ponto onde o caminhante estava
- Aba "Ciência": três objetivos (vida antiga, história geológica, sobrevivência humana) com pesos e fontes
  visíveis, ranking de 12 locais e ficha com os fatores que mais ajudam e mais limitam cada local
- Zonas candidatas geradas a partir de todas as detecções de minerais hidratados do CRISM/OMEGA, com selo de
  confiança, distinção entre explorado e nunca visitado, e verificação de pouso ao vivo sobre o relevo real
- "Planejar Marswalk": paradas científicas escolhidas pelo objetivo, modo a pé ou rover decidido pela
  distância e cobertura científica da rota no painel da EVA
- Scripts `build-science-data.mjs` e `build-prospects.mjs` para regerar os dados a partir do Mars Trek

### Removido

- Missão guiada, modo livre gamificado, conquistas, coleção, quiz, pontuação de capítulos, módulo lunar,
  rover dirigível, tempestades/perigos simulados e terreno gerado
- Planejador de EVA como tela separada (agora faz parte do globo) e a régua do globo (a rota mede distâncias)

## [3.0.0] — não publicado

O foco passa a ser o **planejamento de EVA com dados reais da NASA**; a missão guiada vira camada secundária.

### Adicionado

- Planejador de EVA: relevo real do NASA/JPL Mars Trek (até ~1 m em Jezero e Gusev) com a foto HiRISE/CTX
  por cima, 8 locais prontos e qualquer coordenada (duplo clique no globo ou `#at=lat,lon`)
- Camadas calculadas: altitude, declividade, rugosidade, zonas proibidas, curvas de nível, sombras no
  horário escolhido, cobertura de rádio
- Camadas de instrumentos: THEMIS dia/noite, geologia USGS, MOLA+HRSC, TES (inércia térmica, poeira,
  argilas, piroxênio, albedo), rugosidade MOLA; opacidade, comparação lado a lado e exagero vertical
- Blocos detectados nas sombras da HiRISE, trilha e fotos brutas da Perseverance no mapa, minerais
  hidratados (CRISM/OMEGA)
- Rota A\* que evita declives, rugosidade e blocos (ou manual validada), a pé ou de rover, em dupla ou sozinho
- Perfil de altitude, consumíveis, ponto de não retorno, pior tempo até abrigo, raio de alcance, sinal,
  sombra, dose e nota do plano
- Ambiente real: Mars24 (hora solar, sol da missão, estação, Sol), MEDA e DONKI
- Planos salvos e comparados, exportação GeoJSON, checklist em Markdown e impressão/PDF
- Ensaio da EVA em primeira pessoa sobre 640 m de terreno real, com HUD de segurança
- Página "Fontes e metodologia" e docs/METHODOLOGY.md
- Links diretos `#site=` e `#at=`; cache dos tiles da NASA no service worker

### Alterado

- Globo: camadas ilustrativas trocadas por camadas reais do Mars Trek; luz vinda do ponto subsolar real;
  coordenadas sob o cursor; telemetria simulada trocada por dados reais de Jezero
- Missão guiada e superfície livre usam o relevo e a foto reais de Jezero quando há internet
- Tela inicial: o planejador é a ação principal

### Removido

- Camadas e telemetria simuladas do globo

## [2.0.0] — não publicado

Reescrita completa sobre ES modules, Vite e Three.js r160.

### Corrigido

- Modelo 3D do módulo lunar nunca carregava (faltava o decodificador Draco)
- Vazamento de memória da GPU ao trocar de capítulo (geometrias e texturas não eram liberadas)
- Camadas de dados e textura procedural espelhadas no eixo leste-oeste
- Texto do capítulo anterior reaparecia ao avançar rápido (efeito de digitação)
- Requisição de `mars_bump.jpg` inexistente (404 em todo carregamento)
- Era possível pular capítulos sem cumprir o objetivo; havia dois finais diferentes
- Painéis se sobrepunham em telas de celular

### Adicionado

- Missão: objetivos variados, terrenos por local, oxigênio em tempo real, perigos, pontuação,
  pergunta de campo, falha e nova tentativa, salvamento e "Continuar", dificuldades, tutorial, pausa
- Superfície: rover pressurizado, bússola, minimapa, ciclo de dia com pôr do sol azul, poeira,
  pegadas, sombras e bloom (qualidade alta), gravidade real de Marte (3,721 m/s²)
- Órbita: 7 novos locais, busca e filtros, galeria de fotos, comparação, viabilidade de base,
  luas, sondas, rovers, régua de distância, inclinação axial real, rótulos de texto
- Coleção (conquistas, amostras, recordes), capturas de tela, links diretos
- Configurações completas, português e inglês, unidades imperiais, teclas remapeáveis, gamepad,
  controles de toque, alto contraste, tamanho de texto, movimento reduzido, legendas de som, narração
- Áudio sintetizado: vento, respiração, passos, motor do rover, música ambiente, alarmes
- PWA instalável com uso offline, ícones, prévia para redes sociais
- Testes unitários e ponta a ponta, ESLint, Prettier, CI

### Alterado

- Textura do planeta em WebP com resolução por qualidade (8,4 MB → 0,9 MB no padrão)
- Dados movidos para JSON; telemetria e camadas marcadas como simuladas/ilustrativas
- Fontes auto-hospedadas; nenhuma dependência de CDN
- Content Security Policy e cabeçalhos de segurança no build de produção

## [1.0.0]

Versão original: globo com 7 locais, camadas, telemetria e missão guiada de 6 capítulos.
