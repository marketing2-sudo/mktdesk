# BravaDesk v0.8.3 • Premium Experience

## Pré-requisito
Atualize **somente uma instalação v0.8.2 funcional**. A atualização não substitui os scripts históricos v0.7.3, v0.8.1 ou v0.8.2, nem corrige automaticamente uma migração anterior incompleta. Se o SQL anterior falhou, resolva esse erro primeiro. Faça backup do banco e mantenha a revisão Git que está em produção. Prefira homologação com um banco separado antes de liberar para a equipe.

## 1. Banco (Supabase)
Execute `supabase/v083.sql` integralmente no SQL Editor, sem trechos selecionados. Começa com BEGIN; e termina com COMMIT;. A migração acrescenta colunas ao catálogo de comunicados existente, cria a tabela de leituras individuais, funções de publicação e inbox e índices. Não altera chamados, SLA, usuários, anexos, protocolos ou configurações de serviços. O script é transacional e tem verificação dos pré-requisitos. Não desative RLS.

Em seguida execute `supabase/test-v083.sql`. Os campos booleanos dos dois primeiros SELECTs devem ser true. Os contadores do último SELECT apenas mostram o estado da fila, não confirmam a entrega do push. Não execute o script de esquema inicial em uma instalação existente.

## 2. GitHub e Vercel
Use o ZIP de atualização; copie os arquivos abaixo mantendo exatamente as pastas. Não apague arquivos existentes.

```
src/App.jsx
src/index.css
src/production08.jsx
src/premium083.jsx                 (novo)
src/premium083.js                  (novo)
src/announcementAdmin083.jsx       (novo)
api/push.js
api/automation.js
public/sw.js
package.json
tests/premium083.test.js            (novo, testes opcionais no repositório)
```

Os SQLs são executados pelo Supabase, não pelo navegador. A Vercel deve executar o build e ficar Ready. Não modifique as chaves existentes. Use HTTPS em produção. Reabra o PWA após o deploy para atualizar o service worker; se necessário recarregue. Se o build falhar, não promova a revisão.

## 3. Comunicação
Acesse Central de produção > Comunicados com uma conta admin ou super_admin. Preencha título, mensagem, tipo, destinatários, início e fim. As datas do formulário seguem o fuso do dispositivo (configure o aparelho para Bahia se estiver usando esse fuso). O início vazio publica imediatamente. Selecione se o texto deve aparecer no banner e se deve enviar push. O carrossel mostra os comunicados ativos e destinados ao perfil, a cada seis segundos; anúncios prioritários aparecem primeiro, mas não bloqueiam a rotação. O usuário pode pausar manualmente, navegar pelas setas e indicadores, e ler o texto integral. A rotação também pausa com foco, mouse sobre o banner e preferência de movimento reduzido. Sem anúncio ativo, o banner não é exibido. A listagem carrega até os 200 comunicados mais recentes permitidos; os antigos permanecem no banco até remoção administrativa.

Publicações imediatas criam notificações internas por trigger do banco. O autor não recebe alerta da própria publicação. Comunicados anteriores à migração são preservados sem disparos retroativos. Publique um comunicado novo para testar. Os destinatários devem estar ativos e pertencer ao público selecionado; a segmentação de departamento usa o nome atual do departamento do perfil. O sino usa uma consulta pessoal ordenada (até 500 notificações mais recentes), independente da consulta geral de exportação. Abertura do comunicado registra leitura distinta por usuário; a contagem não representa simples impressões no carrossel.

O push imediato reutiliza `/api/push` para reservar e tentar enviar a até 20 destinatários por publicação. O navegador não determina a lista de destinatários. O agendador encaminha os demais, além de processar publicações futuras. O claim evita que as duas rotas disparem o mesmo alerta; a versão utiliza tentativa única por notificação reservada, sem retentativa automática por dispositivo quando o provedor falha. Um push aceito pelo provedor não comprova a exibição no aparelho. As chaves privadas e o CRON_SECRET permanecem somente no servidor.

## 4. Agendador
Se o Cron da v0.8.1 já funciona, não crie outro. Confira se chama a rota `/api/automation` a cada 5 minutos com método POST, Content-Type application/json, corpo `{}` e Authorization `Bearer <CRON_SECRET>`. Este segredo deve coincidir com o configurado na Vercel. Não exponha a chave service_role ou o segredo no GitHub. Sem Cron, publicações imediatas ainda geram alertas internos e tentam o push inicial, mas não se garante o processamento de publicações agendadas, destinatários restantes, alertas SLA ou recorrências. O push requer VAPID já configurado e permissão/inscrição no dispositivo. No iOS, a instalação PWA e a versão compatível do sistema são necessárias. Som e vibração em background seguem os controles do sistema operacional e navegador.

## 5. Interface
Menu lateral recolhível e preferência persistida no desktop; navegação inferior adaptada a cada papel com acesso à agenda no celular; busca global no conjunto de chamados já autorizados e carregados (Ctrl/Cmd+K); novo layout do login; tokens de cor para modo claro/escuro; botões e foco visível; dashboard e cards com nova hierarquia visual; Kanban com seleção de coluna no celular; painel de chamado lateral em telas largas, tela cheia no celular, chat com campo fixo e mensagens diferenciadas; carrossel no cabeçalho global. Tipografia Inter quando disponível, com fontes do sistema como alternativa, sem dependência externa de fonte. Os gráficos e os fluxos anteriores foram preservados. Não foi introduzido drag-and-drop de transições, para não contornar as regras de aprovação/SLA. Pesquisa não é full-text de todo o banco; busca os registros carregados, não notas privadas. Não há certificação formal de acessibilidade nem teste visual completo nesta entrega.

## 6. Teste com contas reais
- Admin publica para todos, com push marcado. Outra conta ativa deve receber alerta no sino (até 30 segundos se o Realtime estiver ausente); deve aparecer banner.
- Verifique o dispositivo da outra conta em Preferências de notificações: push ativo. Feche o PWA e publique outro comunicado. Clique no push e confirme que abre o comunicado.
- Publique dois comunicados, espere seis segundos, confira rotação, pausa e navegação. Teste agendamento e expiração com Cron ativo. Teste público por departamento e conta de outro setor; ela não deve receber ou ler a publicação segmentada.
- Abra um comunicado e confira aumento do contador de leituras (atualização até 30 s); abrir novamente não deve duplicar.
- Teste mobile em 320, 390 e 430 px; desktop em 1024 e 1440 px; tema claro e escuro. Teste Ctrl+K, recolher menu, agenda e chat.
- Teste regressão: criação de chamado e SLA, observadores, imagens/PDFs, revisão interna, aprovação, entrega via Drive, pausa, reabertura/cancelamento, recorrências, alertas, auditoria, permissões por papel e convite individual.

## 7. Validação e limites
27 testes Node passaram (17 preexistentes + 10 de lógica de comunicados e pesquisa). Sintaxe de JS/JSX e estrutura CSS foram analisadas localmente. npm install não conseguiu resolver registry.npmjs.org (EAI_AGAIN), portanto o build Vite, o uso real em navegador e o teste integrado do push/SQL ainda estão pendentes. A migração SQL teve apenas verificações estruturais, não execução PostgreSQL. Esta entrega é candidata à homologação, não uma garantia de ausência de regressões.
