BravaDesk v0.8.4 - Hotfix de envio imediato (sobre v0.8.3)
1. Substituir src/announcementAdmin083.jsx, api/push.js e api/automation.js.
2. Criar lib/announcementPush.js na raiz, fora de api e src.
3. Publicar todos os arquivos juntos no GitHub e conferir Vercel Ready.
4. Manter o Cron bravadesk-automation apontando para a API atual, schedule */5 * * * *.
5. Publicar comunicado novo, sem preencher início, com Enviar push marcado; testar em outra conta com push ativo.
Não há migração SQL, novas chaves ou mudanças de layout. A Edge Function de diagnóstico não é usada nesta correção.
O envio direto é iniciado pelo navegador do administrador após gravar o comunicado; se não ocorrer, o Cron processa os registros pendentes. Falhas explícitas transitórias 429/5xx são devolvidas à fila apenas se nenhum dispositivo aceitou. Não há garantia de entrega ou exatamente uma vez; timeouts ambíguos, falhas parciais e interrupções após reserva não são reprocessados automaticamente. Não altera o fluxo de demandas.
Validação local: sintaxe JS e JSX, testes simulados da rotina compartilhada. Build, banco e envio real não testados.
