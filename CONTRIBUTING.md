# Como contribuir

## Ambiente

```bash
npm install
```

```bash
npm run dev
```

## Antes de abrir um PR

```bash
npm run check
```

Isso roda lint, formatação, testes unitários e build. Para mudanças em fluxos de tela, rode também:

```bash
npm run test:e2e
```

## Convenções

- **Commits**: [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`,
  `refactor:`, `test:`, `chore:`), como o histórico do projeto já usa.
- **Código e comentários**: em inglês. **Documentação** (`README`, `docs/`): em português.
- **Textos da interface**: nunca escreva texto direto no código. Adicione a chave em
  `src/i18n/en.js` **e** `src/i18n/pt.js` e use `t('chave')`. O teste de traduções falha se faltar algo.
- **Conteúdo** (locais, capítulos): edite os JSON em `src/data/`, sempre com `en` e `pt`.
- **DOM**: use `h()` de `src/core/dom.js`; não use `innerHTML` com dados.
- **Constantes**: números de ajuste vão em `src/config.js`.
- **Recursos 3D**: tudo que for criado em um mundo da superfície é liberado por `disposeWorld()`.
  Marque com `userData.shared = true` o que for compartilhado entre mundos.

## Onde mexer

| Quero…                          | Arquivo                                                         |
| ------------------------------- | --------------------------------------------------------------- |
| Adicionar um local              | `src/data/pois.json`                                            |
| Mudar um capítulo da missão     | `src/data/mission.json`                                         |
| Criar um tipo de terreno        | `src/surface/terrainModel.js` (`PROFILES`)                      |
| Criar um tipo de objetivo       | `src/surface/objectives.js` + chaves `objective.*` e `prompt.*` |
| Criar um perigo                 | `src/surface/hazards.js` + chave `hazard.*`                     |
| Ajustar física, O₂, dificuldade | `src/config.js`                                                 |
| Adicionar uma conquista         | `src/data/catalog.json` + chaves `ach.*`                        |
