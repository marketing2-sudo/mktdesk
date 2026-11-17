# BravaDesk v0.8.1 — Gestão de produção

## Antes de instalar
Candidato à validação, não homologado. Base real: v0.8 Beta. Faça backup/export do banco e mantenha o commit atual do GitHub. Preferencialmente use cópia de teste do Supabase antes da migração em produção. A nova migração pressupõe que v0.7.3 (incluindo anexos, observadores, convites, serviços e protocolos) esteja instalada. Não reaplique schema.sql original em banco existente.

## 1. Supabase
Execute **BravaDesk-v081.sql** (também em `supabase/v081-from-v073.sql`): contém a migração v0.8 Beta e v0.8.1 na mesma transação. Pode ser usada tanto a partir da v0.7.3 como da v0.8 Beta. Não apaga tabelas nem reatribui protocolos. Não execute novamente o SQL incremental separado `v081.sql` se já usou o cumulativo. Execute o arquivo `supabase/test-v081.sql` em ambiente de teste após a migração. Em caso de erro, não continue o deploy; copie a primeira mensagem.

## 2. GitHub / Vercel
Use o ZIP de atualização; mantenha os demais arquivos. Substitua `src/App.jsx`, `src/production08.jsx`, `package.json`; adicione `src/business081.js`, `src/workflow081.jsx`, `api/automation.js` e pasta `tests/`. O projeto completo contém também os arquivos de versões anteriores. Não copie uma `.env` com segredos para o GitHub. Confirme o commit e o build Ready na Vercel. Se ainda estiver na v0.7.3, o ZIP também contém `src/production08.jsx` (novo nesse caso). Mantenha as chaves VAPID e Supabase anteriores.

## 3. Ative a automação (obrigatório para alertas e recorrências)
O endpoint `POST /api/automation` roda `bd081_run_jobs` e processa as notificações push automatizadas. Ele exige `Authorization: Bearer <CRON_SECRET>`.
1. Na Vercel: Settings > Environment Variables. Crie `CRON_SECRET` com um segredo aleatório de pelo menos 32 caracteres, nunca use `VITE_` nesse nome. Não compartilhe o segredo em chats, no SQL público, nem no GitHub. Redeploy para disponibilizá-lo. A função usa também `SUPABASE_SERVICE_ROLE_KEY`, `VITE_SUPABASE_URL`, `VITE_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` já configurados.
2. Supabase Dashboard > Integrations > Cron > Jobs > Create job (habilite a integração e, se solicitado para HTTP, pg_net). Nome: bravadesk-081. Schedule: `*/5 * * * *`. Tipo: HTTP request. Método POST. URL: `https://SEU-DOMINIO-VERCEL/api/automation` (substitua pelo domínio real). Headers: `Authorization: Bearer SEU_CRON_SECRET`, `Content-Type: application/json`. Body: `{}`. Se houver timeout configurável, use 60000 ms. Não exponha o cabeçalho em capturas de tela. Se preferir, guarde o segredo em Vault e use SQL/pg_net com leitura do Vault. Não configure dois jobs para o mesmo endpoint.
3. Confira o histórico do job e logs da função Vercel. Uma resposta 200 com `jobs.recurring`, `jobs.alerts` e estado de push é esperada. O status do job HTTP pode indicar só que a requisição foi enfileirada; confirme também o endpoint. O primeiro disparo pode alertar chamados antigos que já atravessaram vários limites. A rotina não cria eventos históricos em massa; produz um chamado por recorrência vencida e avança para a próxima data futura. Se a recorrência falhar, pausa e mostra erro para o admin.
4. Alertas internos são persistidos mesmo sem push configurado. Push depende de permissão do dispositivo, chaves VAPID, disponibilidade do provedor e entrega best-effort; o código limita a quantidade por rodada e usa marcação de envio para não repetir, mas não garante reenvio automático de push que falhar depois de marcado. Não confundir push com notificação no painel. Após ativar, teste com prazo curto e cron em ambiente de teste.
Referência oficial: https://supabase.com/docs/guides/cron/quickstart

## Regras definidas nesta implementação
- Novos chamados usam expediente fotografado na abertura: seg-sex 09:00–17:30, almoço 12:00–13:00, horário Bahia. Configure os feriados manualmente ANTES de abrir chamados. Ajustes posteriores de expediente/feriados valem para novos chamados; chamados existentes mantêm a política aplicada no momento da abertura. Chamados anteriores à migração mantêm horas corridas. Usuário não pode editar snapshot do novo SLA; banco apura pausas e encerramento. Reabertura retoma o saldo anterior, descontando período fechado. Aguardando aprovação do solicitante continua consumindo SLA, como na base anterior; apenas SAC congela o relógio. Alertas de 75/90/100% acontecem no máximo uma vez por limiar por chamado, inclusive após reabertura. Avisos são enviados ao responsável ativo ou aos administradores quando não há responsável apto.
- Cancelamento e reabertura: equipe ou próprio solicitante, com justificativa pública; observador não altera. Cancelados não entram na fila ativa nem como concluídos. O indicador aberto/fechado original continua contando aberturas inclusive canceladas.
- Revisão interna: técnico ou admin envia link HTTPS do Google Drive/Docs. Apenas admin/super_admin aprova ou devolve; admin pode aprovar sua própria versão. A versão rascunho fica em tabela privada. A aprovação interna publica a entrega para o solicitante. Pedido de ajustes do solicitante está no histórico público, e nova submissão cria nova versão numerada. Entregas anteriores à migração permanecem no histórico, sem renumeração retroativa. Não há integração de edição de arquivos no Drive; mantenha as permissões do link adequadas. Reprovação interna e retirada exigem motivo. Uma versão pendente por chamado.
- Menções: escolha um colaborador e insira @e-mail exato; não apenas nome livre. Em notas internas só equipe; no chat público, equipe, solicitante ou observadores daquele chamado. Não notifica o autor da mensagem e deduplica menções por mensagem/destinatário. Observadores continuam somente leitura.
- Recorrências: só admin/super_admin agenda a partir de chamado modelo; cópia do título, serviço, prioridade, objetivo, briefing, solicitante e departamento. Não copia anexos, observadores, links de referência, entrega, notas, atribuição ou avaliações. Usa serviço ativo com SLA atual. Diária/semanal/mensal; dia mensal 31 se ajusta ao último dia do mês menor. Frequências são dias de calendário, incluindo feriados; SLA do novo chamado só corre em expediente útil. Agenda não é automaticamente ligada por instalar SQL. Usuário e departamento têm de estar ativos.
- Auditoria: Super Admin acessa páginas de 100 registros, com autor, horário e valores antes/depois dos metadados monitorados (serviços, departamentos, status, responsáveis, expediente, checklist, convites, revisão, recorrência, etc.). Registra metadados de mensagens e notas privadas sem copiar o texto; não registra senhas, tokens, hashes de convite, nem todo evento de autenticação ou leitura. Registros anteriores à instalação não podem ser reconstruídos.
- Dependências já existentes, código dos anexos e notificações push antigo preservados. A função automática nova é separada de `/api/push`.

## 4. Validação antes de liberar
- [ ] Executar SQL cumulativo e `test-v081.sql` no projeto de teste.
- [ ] Vercel build Ready, login com conta solicitante, técnico, admin, super_admin e observador.
- [ ] Configurar expediente/feriados, cadastrar serviço com SLA curto, testar sexta, almoço, feriado, pausa e retomada, conclusão e reabertura.
- [ ] Solicitar revisão interna (não expor link ao solicitante antes da aprovação); rejeitar e registrar nova versão; aprovar, pedir ajustes e concluir.
- [ ] Enviar imagem/PDF, Ctrl+V, notas privadas, anexos públicos e observar acesso com conta observadora.
- [ ] Testar convite, protocolo sequencial, status personalizado, dashboard meta 85%, modo escuro, PWA, briefing e checklist.
- [ ] Cancelar com justificativa, confirmar fora da fila; reabrir; observador não consegue alterar.
- [ ] Mencionar usuário permitido no chat público e em nota privada; não notificar usuários sem acesso.
- [ ] Agendar recorrência e conferir protocolo distinto e ausência de duplicação; testar limiares SLA, entrega push e job com aplicativo fechado.
- [ ] Ver auditoria e calendário semanal/mensal com dados reais.

## Validação realizada no ambiente de geração
- Nove testes automatizados isolados de cálculo em JavaScript passaram (`npm test`, sem dependências externas).
- Sintaxe de onze arquivos JS/JSX verificada por parser/transpilador TypeScript e `node --check` no JS resultante.
- `npm install` falhou por DNS (EAI_AGAIN), impossibilitando Vite build e testes de navegador. Não há PostgreSQL executável no ambiente; SQL foi revisado estaticamente, não executado, e os testes SQL incluídos são para seu ambiente de testes. Não afirmamos validação integral das permissões, concorrência, automações ou integração. Não há garantia de ausência de regressões. Se o deploy falhar, não libere para a equipe. Preserve o backup e não desative RLS para contornar erros.
