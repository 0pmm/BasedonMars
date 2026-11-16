/** Falas do GENIE (assistente). Chaves iguais às de genie.en.js. */
export default {
  'genie.ask': 'Pergunte ao GENIE',
  'genie.ok': 'Entendi',
  'genie.more': 'Saber mais',
  'genie.less': 'Menos',
  'genie.unknown': 'Ainda estou aprendendo sobre isso!',

  'genie.distance.title': 'Distância',
  'genie.distance.text': 'Olá! É quanto você vai andar seguindo a rota, contando as curvas e desvios, e não a linha reta.',
  'genie.distance.now': 'Na sua rota são {d}.',
  'genie.duration.title': 'Duração',
  'genie.duration.text': 'É o tempo total da EVA: o tempo andando (mais devagar em subida) mais o tempo de trabalho em cada parada.',
  'genie.duration.now': 'Sua rota leva {total}: {move} andando e {stops} nas paradas.',
  'genie.climb.title': 'Subida e descida',
  'genie.climb.text': 'Soma de todos os metros que você sobe e desce. Subir gasta muito mais energia e oxigênio do que andar no plano.',
  'genie.climb.now': 'Nesta rota: sobe {up} e desce {down}.',
  'genie.maxSlope.title': 'Declividade',
  'genie.maxSlope.text':
    'A declividade indica o quanto o chão é inclinado. Imagine uma rua: se ela for muito íngreme, fica difícil e perigoso passar. No mapa, ela ajuda a achar terrenos íngremes e decidir se servem para o trajeto.',
  'genie.maxSlope.now': 'O trecho mais inclinado da sua rota tem {max}°, e o limite do traje é {lim}°.',
  'genie.maxSlope.extra':
    'O app mede a declividade comparando a altura de pontos vizinhos no relevo real da NASA. Acima do limite, o caminho é proibido e a rota desvia.',
  'genie.o2.title': 'Oxigênio',
  'genie.o2.text': 'Quanto do oxigênio utilizável do traje a caminhada vai gastar. O consumo cresce quando você sobe ou anda mais rápido.',
  'genie.o2.now': 'Esta rota usa {pct}% do utilizável (cerca de {g} g), e ainda sobra a reserva de segurança de {reserve}%.',
  'genie.pnr.title': 'Ponto de não retorno',
  'genie.pnr.text':
    'É o ponto mais longe aonde você pode ir e ainda voltar pelo mesmo caminho com o oxigênio que tem. Passou dele, não dá mais para voltar com segurança.',
  'genie.pnr.now': 'Na sua rota ele fica a {d} da base (a rota tem {total}).',
  'genie.shelter.title': 'Pior tempo até a base',
  'genie.shelter.text':
    'Se o Sol soltar uma tempestade de partículas, é preciso correr para o abrigo. Este é o maior tempo, em qualquer ponto da rota, para voltar à base. O ideal é até 30 minutos.',
  'genie.shelter.now': 'Na sua rota, o pior caso é {t}.',
  'genie.range.title': 'Raio de alcance',
  'genie.range.text':
    'Até onde dá para ir e voltar em terreno plano com o oxigênio do traje. É o círculo verde tracejado em volta da base.',
  'genie.range.now': 'Com as premissas atuais, o raio é de {d}.',
  'genie.comms.title': 'Rota com sinal',
  'genie.comms.text':
    'O rádio em Marte precisa de "linha de visada": se um morro ficar entre você e a antena da base, o sinal cai. Esta é a parte da rota em que a base te vê.',
  'genie.comms.now': '{pct}% da sua rota tem sinal, com a antena a {mast} m de altura.',
  'genie.dose.title': 'Dose de radiação',
  'genie.dose.text':
    'Marte quase não tem campo magnético nem atmosfera grossa, então a radiação chega ao chão. Este é o quanto você recebe durante a EVA, com base no que o rover Curiosity mediu.',
  'genie.dose.now': 'Nesta EVA: {msv} mSv (uma radiografia de tórax tem cerca de 0,1 mSv).',
  'genie.score.title': 'Nota do plano',
  'genie.score.text':
    'Uma nota de 0 a 100 para comparar planos: metade vem da segurança, 30% da ciência (paradas científicas) e 20% da eficiência (quão perto da linha reta).',
  'genie.score.now': 'Seu plano: {total} (segurança {s}, ciência {c}, eficiência {e}).',
  'genie.profile.title': 'Perfil de altitude',
  'genie.profile.text':
    'O desenho mostra a altura do chão ao longo da rota. As cores indicam a inclinação, as linhas amarelas são as paradas e a linha vermelha tracejada é o ponto de não retorno.',
  'genie.profile.now': 'O ponto de não retorno está a {pnr}.',
  'genie.why.title': 'Por que esta rota?',
  'genie.why.text':
    'Aqui eu comparo a rota escolhida com a linha reta. O caminho mais curto nem sempre é o melhor: subir uma montanha ou passar perto de rochas custa mais tempo, oxigênio e risco.',
  'genie.why.now': 'A rota custa {saved}% menos que a linha reta, que passaria por {blocked} de terreno proibido.',
  'genie.why.extra':
    'O custo de cada passo soma o tempo de caminhada, o esforço (subida gasta mais O₂) e o risco do lugar: declive perto do limite, chão irregular, perto de rochas, solo solto, sem rádio e sombra.',
  'genie.priority.title': 'Prioridade da rota',
  'genie.priority.text':
    'Diz ao planejador o que importa mais. Segurança desvia mais de riscos; Rapidez aceita mais risco para chegar antes; Equilíbrio fica no meio.',
  'genie.priority.now': 'Agora está em: {p}.',
  'genie.mode.title': 'A pé ou rover',
  'genie.mode.text':
    'A pé você é mais lento, mas sobe declives menores. O rover é mais rápido e carrega mais oxigênio, mas precisa de terreno mais liso e longe das rochas.',
  'genie.mode.now': 'Modo atual: {m}, com limite de {lim}° de declive.',
  'genie.crew.title': 'Equipe',
  'genie.crew.text':
    'A NASA nunca faz caminhada espacial sozinho: um ajuda o outro se algo der errado. Sair sozinho diminui a nota de segurança.',
  'genie.returnToBase.title': 'Voltar à base',
  'genie.returnToBase.text': 'Quando marcado, a rota termina de volta na base, que é o normal numa EVA. Desmarque para planejar só a ida.',
  'genie.ltst.title': 'Hora solar local',
  'genie.ltst.text':
    'É a hora pelo Sol no lugar da base, no relógio de Marte (um dia lá dura 24 h 39 min). Ela muda as sombras, a luz e a temperatura do seu plano.',
  'genie.params.title': 'Premissas do traje',
  'genie.params.text':
    'São os números que o planejador usa: velocidade de caminhada, inclinação máxima, autonomia de oxigênio, reserva. Mude e a rota é recalculada na hora.',
  'genie.params.now': 'Agora: {speed} m/s no plano, {o2h} h de oxigênio a 300 W, até {lim}° a pé.',
  'genie.season.title': 'Estação do ano',
  'genie.season.text':
    'Marte tem estações como a Terra, mas cada uma dura cerca do dobro. O "Ls" é a posição de Marte ao redor do Sol (0° a 360°). Entre Ls 180° e 330° é a época das tempestades de poeira.',
  'genie.sun.title': 'Posição do Sol',
  'genie.sun.text':
    'Elevação é a altura do Sol no céu (0° = horizonte) e azimute é a direção (0° = norte). Sol baixo faz sombras longas e menos calor.',
  'genie.daylight.title': 'Nascer e pôr do sol',
  'genie.daylight.text':
    'Horas do nascer e do pôr do sol no local da base. Planeje a EVA com luz: à noite a temperatura cai para menos de −80 °C.',
  'genie.irradiance.title': 'Irradiância solar',
  'genie.irradiance.text':
    'Quanta energia do Sol chega a Marte por metro quadrado. É menos da metade da Terra, porque Marte está mais longe, e a poeira ainda bloqueia parte.',
  'genie.pressure.title': 'Pressão',
  'genie.pressure.text':
    'O ar de Marte é muito fino: menos de 1% da pressão da Terra. Por isso é obrigatório usar traje pressurizado. Lugares mais baixos têm um pouco mais de pressão.',
  'genie.doseRate.title': 'Radiação de fundo',
  'genie.doseRate.text':
    'Quanta radiação o chão recebe por dia neste lugar, segundo o instrumento RAD do Curiosity. Locais mais altos recebem um pouco mais, porque há menos ar por cima.',

  'genie.layerNone.title': 'Fotos reais',
  'genie.layerNone.text':
    'Esta é a cara de Marte vista de órbita: as cores vêm do mosaico das sondas Viking e os detalhes das câmeras HiRISE (25 cm), CTX (6 m) ou THEMIS. A cor é aproximada; as formas e o claro/escuro são reais.',
  'genie.layer_slope.title': 'Camada de declividade',
  'genie.layer_slope.text':
    'Pinta o chão pela inclinação: azul é plano, verde e amarelo são rampas e vermelho é muito íngreme (perto ou acima de {lim}°, o limite do traje).',
  'genie.layer_hazard.title': 'Zonas proibidas',
  'genie.layer_hazard.text': 'Em vermelho estão os lugares mais inclinados que o limite do traje ({lim}°). A rota nunca passa por eles.',
  'genie.layer_elevation.title': 'Altitude',
  'genie.layer_elevation.text':
    'Pinta o chão pela altura: azul é o mais baixo e vermelho o mais alto do que aparece na tela. As cores se ajustam quando você move o mapa.',
  'genie.layer_contours.title': 'Curvas de nível',
  'genie.layer_contours.text':
    'Cada linha liga pontos da mesma altura, como num mapa de trilha. Linhas juntinhas = terreno íngreme; linhas espaçadas = terreno suave.',
  'genie.layerScale':
    'Dica: de longe, o app usa o relevo com menos detalhe e mostra o valor máximo de cada região, para morros e penhascos não sumirem. Aproxime para ver no detalhe do metro.',
  'genie.layerKind.optical': '{name}: uma imagem tirada de órbita por {inst}, com resolução de {res}.',
  'genie.layerKind.thermal':
    '{name}: mostra a temperatura do chão medida por {inst} ({res}). Chão quente à noite costuma ser rocha; frio costuma ser areia e poeira.',
  'genie.layerKind.spectral': '{name}: mostra do que o chão é feito, medido pela luz que ele reflete ({inst}, {res}).',
  'genie.layerKind.topography': '{name}: mostra o relevo medido por laser ou estéreo ({inst}, {res}).',
  'genie.layerKind.geology': '{name}: um mapa geológico ({inst}). Cada cor é um tipo de terreno de uma idade diferente.',
  'genie.layerMeasured': 'Estes valores foram medidos por instrumentos da NASA.',
  'genie.layerInterpreted': 'Este mapa é uma interpretação de geólogos, feita a partir de medições.',

  'genie.sol.title': 'Sol',
  'genie.sol.text': 'Em Marte o dia se chama "sol". Este número conta os sóis desde o pouso da Perseverance em Jezero.',
  'genie.sol.now': 'Hoje é o sol {v}.',
  'genie.localTime.title': 'Hora local em Jezero',
  'genie.localTime.text':
    'É a hora agora na cratera Jezero, onde está a Perseverance, calculada pelo relógio oficial de Marte (Mars24) da NASA.',
  'genie.localTime.now': 'Agora são {v} lá.',
  'genie.temperature.title': 'Temperatura',
  'genie.temperature.text':
    'Mínima e máxima do último dia medido pela estação meteorológica MEDA da Perseverance. Em Marte a temperatura muda muito entre o dia e a noite.',
  'genie.temperature.now': 'Último dado: {v}.',
  'genie.telePressure.title': 'Pressão do ar',
  'genie.telePressure.text': 'Pressão medida pela MEDA. Na Terra é cerca de 101.000 Pa; em Marte fica perto de 700 Pa.',
  'genie.telePressure.now': 'Último dado: {v}.',
  'genie.radiation.title': 'Radiação',
  'genie.radiation.text': 'Dose média medida pelo Curiosity no chão de Marte: cerca de 0,64 mSv por dia, umas 200 vezes mais que na Terra.',

  'genie.hudO2.title': 'Oxigênio do traje',
  'genie.hudO2.text': 'Quanto oxigênio ainda resta no traje. Ele diminui mais rápido quando você sobe e mais devagar quando está parado.',
  'genie.hudO2.now': 'Agora: {pct}%.',
  'genie.hudDose.title': 'Dose acumulada',
  'genie.hudDose.text': 'Radiação recebida desde o início da EVA.',
  'genie.hudDose.now': 'Até agora: {msv} mSv.',
  'genie.hudClock.title': 'Relógio da EVA',
  'genie.hudClock.text':
    'O tempo de caminhada espacial. Em ×1 ele anda junto com o seu relógio; nos botões você acelera o tempo, e o oxigênio e o Sol acompanham.',
  'genie.hudClock.now': 'Fator atual: ×{x}.',
  'genie.hudGround.title': 'De onde vem o chão',
  'genie.hudGround.text':
    'Mostra a qualidade dos dados reais embaixo de você: o nível do relevo (17 ≈ 1 m de detalhe) e a foto de órbita usada.',
  'genie.hudGround.now': 'Aqui: relevo nível {z}, foto {src}.',
  'genie.hudEnv.title': 'Ambiente',
  'genie.hudEnv.text': 'Temperatura estimada, pressão e quanta poeira há no ar (τ). Mais poeira = névoa mais fechada e menos sol direto.',
  'genie.hudEnv.now': 'Agora: τ {tau}, névoa a ~{km} km, {ltst} no local.',
};
