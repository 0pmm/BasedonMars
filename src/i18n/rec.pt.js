/** Recomendação de local/zona, seletor com filtros, explicações do GENIE e tour guiado. Chaves iguais às de rec.en.js. */
export default {
  // ---- cartão de recomendação
  'rec.kicker.site': 'Melhor local para {obj}',
  'rec.kicker.zone': 'Melhor zona para {obj}',
  'rec.kicker.filter': 'destaque: {f}',
  'rec.kicker.picked': 'Sua escolha',
  'rec.backToBest': 'Voltar à recomendação',
  'rec.whyBest': 'Por que é a melhor escolha',
  'rec.whyBestZone': 'Por que esta zona',
  'rec.strengths': 'Pontos fortes',
  'rec.watch': 'Pontos de atenção',
  'rec.allAttrs': 'Todas as características ({n})',
  'rec.change.site': 'Trocar local',
  'rec.change.zone': 'Trocar zona',
  'rec.options': '{n} opções',
  'rec.highlightBy': 'Destacar por',
  'rec.filter.general': 'Geral',
  'rec.recommended': 'Recomendado',
  'rec.current': 'Atual',
  'rec.score': 'aptidão',
  'rec.standsOut': 'Destaca-se em',
  'rec.landing.loading': 'Baixando o relevo real da zona e procurando o trecho mais plano…',

  // ---- seletor (tela inteira)
  'rec.picker.siteTitle': 'Escolher local · {obj}',
  'rec.picker.zoneTitle': 'Escolher zona · {obj}',
  'rec.picker.siteIntro':
    'Todos os locais estudados, do mais ao menos indicado para este objetivo. Os filtros mostram onde cada um se destaca.',
  'rec.picker.zoneIntro':
    'Zonas agrupadas a partir de {n} detecções de minerais hidratados (CRISM e OMEGA). Os filtros mostram onde cada uma se destaca.',

  // ---- por que é bom (linguagem simples)
  'rec.why.unitDiversity':
    'Muitos tipos de rocha e camadas num mesmo lugar: dá para ler vários capítulos da história de Marte numa só caminhada.',
  'rec.why.aqueousContext': 'Há sinais claros de que já correu ou ficou parada água aqui: rios, lagos ou deltas antigos.',
  'rec.why.hydration': 'Satélites detectaram minerais que só se formam na presença de água.',
  'rec.why.exposure': 'Pouca poeira cobrindo o chão: as rochas ficam à vista para estudar.',
  'rec.why.trafficability': 'Chão firme e pouco inclinado: fácil de andar, dirigir e pousar.',
  'rec.why.power': 'Bastante sol ao longo do ano: boa energia para painéis solares.',
  'rec.why.comms': 'Boa posição em relação aos satélites que retransmitem o sinal: contato frequente com a Terra.',
  'rec.why.shielding': 'Lugar baixo: mais atmosfera por cima, então chega menos radiação ao chão.',
  'rec.why.waterAccess': 'Água ao alcance (em minerais hidratados ou gelo): dá para extrair para beber, fazer oxigênio e combustível.',

  // ---- o que pesa contra
  'rec.watchFor.unitDiversity': 'Pouca variedade de rochas: a história contada aqui é mais curta.',
  'rec.watchFor.aqueousContext': 'Poucos sinais de água no passado.',
  'rec.watchFor.hydration': 'Poucas detecções de minerais com água.',
  'rec.watchFor.exposure': 'Muita poeira cobre as rochas.',
  'rec.watchFor.trafficability': 'Terreno difícil: areia fofa, pedras ou ladeiras.',
  'rec.watchFor.power': 'Menos sol (latitude alta ou muita poeira): energia mais limitada.',
  'rec.watchFor.comms': 'Contato com os satélites menos frequente.',
  'rec.watchFor.shielding': 'Lugar alto: menos atmosfera para proteger da radiação.',
  'rec.watchFor.waterAccess': 'Água difícil de obter aqui.',

  // ---- zonas
  'rec.zones.introGeology':
    'Zonas são regiões onde satélites encontraram minerais que só se formam com água: pistas de como era Marte no passado.',
  'rec.zones.introSurvival':
    'Zonas são regiões com minerais que guardam água presa: possíveis fontes de água para uma base, se houver sol e chão plano.',
  'rec.zfilter.general': 'Geral',
  'rec.zfilter.detections': 'Mais detecções',
  'rec.zfilter.confidence': 'Maior confiança',
  'rec.zfilter.sunlight': 'Mais sol',
  'rec.zfilter.unexplored': 'Nunca visitadas',
  'rec.zone.past': '{n} detecções de minerais com água num raio de {km} km: um sinal forte de que já houve água ali.',
  'rec.zone.water': '{n} detecções de minerais com água num raio de {km} km: uma possível fonte de água para a base.',
  'rec.zone.confHigh': 'Confiança alta: várias observações independentes concordam.',
  'rec.zone.new': 'Nenhuma missão pousou perto: tudo ali seria novo.',
  'rec.zone.sunGood': 'Latitude {lat}°: perto do equador, sol forte o ano inteiro para os painéis solares.',
  'rec.zone.sunLow': 'Latitude {lat}°: longe do equador, menos sol no inverno.',
  'rec.zone.confMedium': 'Confiança média: poucas observações; confirme com imagens de alta resolução.',
  'rec.zone.explored': 'Perto de um local já visitado: menos novidade científica.',
  'rec.ztag.conf.high': 'confiança alta',
  'rec.ztag.conf.medium': 'confiança média',
  'rec.ztag.conf.low': 'confiança baixa',
  'rec.ztag.new': 'nunca visitada',
  'rec.ztag.lat': 'latitude {lat}',

  // ---- objetivos que as missões tiveram, mas o app não oferece mais
  'science.objLegacy.life': 'Vida antiga (astrobiologia)',

  // ---- um só tipo de lista: locais estudados + áreas candidatas
  'rec.exploredLabel': 'Exploração',
  'rec.explored.all': 'Todos',
  'rec.explored.explored': 'Já explorados',
  'rec.explored.unexplored': 'Nunca explorados',
  'rec.kind.site': 'Local estudado',
  'rec.kind.zone': 'Área candidata',
  'rec.zoneTitle': 'Área {coords}',
  'rec.zoneNote': 'Área com {n} detecções de minerais com água num raio de {km} km, conhecida só por dados de órbita.',
  'rec.src.hydration': 'CRISM/OMEGA: {n} detecções num raio de {km} km',
  'rec.src.water': 'Minerais hidratados detectados de órbita como fonte de água',
  'rec.src.power': 'Latitude {lat}° (insolação ao longo do ano)',
  'rec.place.new': 'Nunca explorado: tudo o que se encontrar ali será novo.',
  'rec.place.nearKnown': 'A {km} km de {name}, um local já explorado.',
  'rec.place.nearShort': 'a {km} km de {name}',
  'rec.place.nearSurvival': 'A {km} km de {name}, já explorado: terreno, clima e rotas de pouso já conhecidos ajudam a montar a base.',
  'rec.place.partial': 'Avaliado com {n} de {m} critérios, só com dados de órbita: confirme com imagens de alta resolução.',
  'rec.place.exploredBy': 'Explorado por {missions}',
  'rec.place.exploredNear': 'Explorado: perto de {name} ({missions})',
  'rec.place.never': 'Nunca explorado',
  'rec.mapToggle': 'Áreas candidatas no mapa',
  'rec.none': 'Nenhum local com este filtro.',
  'rec.unknown': 'sem dados (só observado de órbita)',
  'rec.allAttrsTitle': 'Todas as características',
  'rec.picker.placesIntro':
    'Locais estudados e áreas candidatas detectadas pelos satélites, do mais ao menos indicado para este objetivo. Filtre pelos já explorados ou nunca explorados e veja onde cada um se destaca.',
  'rt.dock.toggle': 'Rota',
  'rt.rehearse': 'Ensaio final',
  'rt.rehearseHint': 'Revise o plano e percorra a rota em primeira pessoa.',
  'guide.try.title': 'Ensaio final',
  'guide.try.noRoute': 'Planeje uma rota primeiro para ensaiá-la em primeira pessoa.',
  'genie.explored.title': 'Já explorados ou não',
  'genie.explored.text':
    'Locais já explorados receberam um pouso ou um rover: as missões aparecem ao lado do nome, e há muitos dados de solo. Os nunca explorados são novidade: alguns foram estudados de órbita por cientistas, outros são áreas candidatas que os satélites marcaram por terem minerais com água.',

  // ---- GENIE: novos tópicos
  'genie.fitScore.title': 'Aptidão ao objetivo',
  'genie.fitScore.text':
    'É uma nota de 0 a 100 de quanto este lugar ajuda no objetivo escolhido. Cada característica (água, sol, terreno…) tem uma nota e um peso, e a aptidão é a soma ponderada. Os pesos e as fontes estão em "Todas as características".',
  'genie.fitScore.now': '{name} tem {score}/100 e vai melhor em: {best}.',
  'genie.recFilter.title': 'Destacar por',
  'genie.recFilter.text':
    '"Geral" equilibra todos os critérios do objetivo. Os outros filtros mostram o melhor lugar em um critério só, útil quando uma coisa importa mais para você, como água ou sol. A recomendação muda na hora.',
  'genie.criterion.title': '{name}',
  'genie.criterion.unitDiversity':
    'Quantos tipos de rocha e de camadas existem num mesmo lugar. Cada camada é uma página da história de Marte: mais variedade, mais história para ler.',
  'genie.criterion.aqueousContext':
    'Se o relevo mostra que já houve água: leitos de rio, deltas, fundos de lago. Vem de estudos publicados com imagens de órbita.',
  'genie.criterion.hydration':
    'Minerais que só se formam com água (argilas, sulfatos), detectados de órbita pelos espectrômetros CRISM e OMEGA.',
  'genie.criterion.exposure': 'Quanto da rocha está à vista, sem poeira por cima. Rocha coberta não dá para estudar nem amostrar.',
  'genie.criterion.trafficability':
    'Facilidade de andar e dirigir: chão firme, pouca inclinação, poucas pedras grandes. Também deixa o pouso mais seguro.',
  'genie.criterion.power':
    'Quanta energia solar dá para gerar: depende da latitude (perto do equador o sol é mais forte o ano todo) e da poeira no ar.',
  'genie.criterion.comms': 'Com que frequência os satélites em órbita passam por cima para levar e trazer mensagens da Terra.',
  'genie.criterion.shielding':
    'Proteção contra radiação dada pela atmosfera. Em lugares baixos há mais ar por cima, então menos radiação chega ao chão.',
  'genie.criterion.waterAccess':
    'Se dá para tirar água do local, de minerais hidratados ou gelo no subsolo. Água vira bebida, oxigênio e até combustível.',
  'genie.criterion.now': 'Aqui: {value}%.',
  'genie.zones.title': 'Zonas candidatas',
  'genie.zones.text':
    'São regiões onde os satélites CRISM e OMEGA detectaram minerais que só se formam com água. Várias detecções próximas viram uma zona. Para a história geológica, mostram onde houve água; para uma base, onde talvez dê para extrair água. Onde não houve observação não há detecção, o que não quer dizer que não exista.',
  'genie.landing.title': 'Verificar pouso',
  'genie.landing.text':
    'O app baixa o relevo real da zona e procura o trecho mais plano e liso para pousar e montar a base. A nota de 0 a 100 considera declive, rugosidade, altitude (mais ar ajuda o paraquedas) e latitude.',
  'genie.objective.title': 'Objetivo da missão',
  'genie.objective.text':
    'O objetivo muda tudo: quais locais são recomendados, quais critérios pesam mais e quais zonas aparecem no globo. Na exploração livre nada é recomendado: é só você e o mapa.',
  'genie.modes.title': 'Comparar perfis de rota',
  'genie.modes.text':
    'A mesma rota calculada de três jeitos. Rápido aceita ladeiras até o limite do traje para chegar antes. Seguro fica longe de declives e contorna morros, mesmo andando mais. Equilibrado fica no meio. Clique numa linha para usar aquele perfil; as outras aparecem mais apagadas no mapa.',
  'genie.layers.title': 'Camadas do mapa',
  'genie.layers.text':
    'Pinte o globo com dados reais: medições de instrumentos da NASA (temperatura, minerais, relevo) ou camadas calculadas do relevo (declividade, zonas proibidas, altitude, curvas de nível). Escolha uma e a legenda aparece embaixo à esquerda.',

  // ---- tour guiado
  'tour.start': 'Fazer o tour com o GENIE',
  'tour.startSub': 'Um passeio de 2 minutos pelo app',
  'tour.next': 'Próximo',
  'tour.prev': 'Voltar',
  'tour.skip': 'Pular tour',
  'tour.done': 'Começar a explorar',
  'tour.step': '{i} de {n}',
  'tour.welcome.title': 'Oi, eu sou o GENIE!',
  'tour.welcome.text':
    'Vou te mostrar o Mars Explorer. Aqui você escolhe o que quer descobrir em Marte, encontra o melhor lugar, planeja uma caminhada segura sobre o relevo real da NASA e depois anda por ela em primeira pessoa.',
  'tour.objectives.title': 'Escolha um objetivo',
  'tour.objectives.text':
    'História geológica procura os lugares que melhor contam como Marte mudou. Sobrevivência humana procura onde faria sentido montar uma base. Exploração livre deixa você ir aonde quiser, sem recomendação.',
  'tour.globe.title': 'O globo é real',
  'tour.globe.text': 'Arraste para girar e use a rodinha para aproximar sem cortes até o chão. As fotos e o relevo vêm das sondas da NASA.',
  'tour.header.title': 'Missão e telemetria',
  'tour.header.text':
    'No topo ficam o seu objetivo (clique para trocar) e dados ao vivo de Jezero: sol, hora local, estação e radiação. Os "?" abrem minhas explicações.',
  'tour.rail.title': 'Ferramentas do mapa',
  'tour.rail.text':
    'Nesta barra você troca as camadas (declividade, minerais, temperatura…), mostra rótulos e satélites, aponta para o norte, tira uma foto ou entra em tela cheia.',
  'tour.guide.title': 'O guia em 3 passos',
  'tour.guide.text':
    'No painel da direita: 1 Objetivo, 2 Local e 3 Rota. No Local eu mostro o melhor lugar e, abrindo cada seção, o porquê. "Trocar local" abre todas as opções, com filtros de já explorados ou nunca explorados.',
  'tour.route.title': 'Planeje a rota',
  'tour.route.text':
    'Na aba 3, Rota, marque a base e as paradas clicando no terreno: a rota desvia de declives e pedras, e você compara Rápido, Equilibrado e Seguro.',
  'tour.walk.title': 'Ensaio final',
  'tour.walk.text':
    'Com a rota pronta, o "Ensaio final" abre um resumo do plano e leva você a percorrer a rota em primeira pessoa, com oxigênio, tempo e Sol correndo de verdade. Pronto? Vamos lá!',
};
