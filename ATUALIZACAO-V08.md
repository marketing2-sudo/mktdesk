# BravaDesk 0.8.0-beta.1 — prévia incremental
Base: v0.7.3. Faça backup e teste em ambiente separado antes de produção.
1. Confirme que a v0.7.3 e as migrações anteriores estão funcionais.
2. Execute somente supabase/v08.sql no SQL Editor. A migração é aditiva; adiciona quatro tabelas com RLS e triggers de auditoria.
3. Atualize src/App.jsx, src/production08.jsx e package.json no GitHub; confirme build na Vercel.
4. Em Central de produção, configure expediente para projeção, feriados, respostas rápidas e checklist padrão. Teste calendário, comunicados e auditoria. Checklist dentro do chamado para equipe; respostas rápidas inserem texto no chat, sem enviar automaticamente. Briefing configurável em Serviços, Status & Configurações; respostas entram na descrição.
5. Valide com contas Super Admin, Admin, Técnico, Solicitante e Observador. Confira push e anexos existentes.

Entrega parcial: calendário mensal com prazo estimado pelo SLA corrido, projeção informativa de prazo útil (sem pausas), briefing opcional por serviço, checklist padrão compartilhado, respostas rápidas, auditoria de metadados, comunicados no painel, painel individual e contagem de ajustes. Não há alterações no cálculo oficial de SLA, calendário semanal, agendamento de alertas, recorrência, reabertura/cancelamento, menções com notificação ou aprovação interna obrigatória. Não há notificações push de comunicados. O checklist não é por serviço. A auditoria registra somente campos selecionados e eventos de alteração, sem conteúdo privado; não é histórico completo. Não há revisão de versões de materiais, apenas contagem de pedidos de ajustes. Sintaxe JSX analisada; build e banco não executados. Não aplicar em produção sem testar.
