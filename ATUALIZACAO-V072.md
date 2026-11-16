# BravaDesk 0.7.2

Base: 0.7.1 com push configurado e modo escuro. Marketing permanece único setor atendente.

## Instalação
1. Faça backup do banco (incluindo notas internas) e programe uma breve janela sem uso.
2. Execute somente `supabase/v072.sql` integralmente no SQL Editor. Não execute os schemas anteriores. O SQL está em uma transação: se falhar, envie o erro completo antes de publicar.
3. Substitua `src/App.jsx` e `package.json` no GitHub. Aguarde Ready e atualize a página. Não altere chaves VAPID ou variáveis existentes.
4. Administração > Configurações > Gestão de Departamentos: adicione/edite/ative/desative; clique em Salvar departamentos. O catálogo começa com os departamentos antigos e os existentes em perfis/chamados. Nomes antigos ficam no histórico.
5. Na abertura do chamado, selecione o departamento e pesquise observadores cadastrados e ativos do mesmo departamento. Até 20. O autor ou equipe pode editar observadores nos detalhes. Solicitantes têm a aba Chamados que acompanho. Notificações usam o push existente.

## Teste de aceitação
- Criar departamento, atualizar página, verificar cadastro de novo usuário e filtro de BI.
- Criar chamado com um observador do mesmo departamento. Entrar com essa conta separada: deve visualizar o chamado e as mensagens públicas, mas não responder ou aprovar. Outra conta não relacionada não deve ter acesso.
- Enviar resposta pública como técnico: observador deve receber aviso; enviar nota interna: observador não recebe nem consegue consultar a nota. Notas internas antigas e novas ficam em bd_private_notes, com SELECT restrito à equipe.
- Remover observador, atualizar a página da conta observadora e verificar que o acesso foi revogado. O servidor restringe novas consultas imediatamente, não pode apagar informação já visualizada; o aplicativo recarrega dados periodicamente.
- Conferir protocolo, SLA, push, modo escuro e convites existentes.

## Limitações
JSX analisado sintaticamente pelo TypeScript, sem build integral nem teste em banco real. A migração assume schema v0.7 corrigido e trigger trg_protect_ticket instalado. Não aplique em banco diferente sem revisar. A lista geral de perfis já existente continua acessível a usuários ativos; rever minimização de dados em evolução futura. Notas internas não aparecem no caixa de dados JSON anterior, portanto backups futuros devem incluir a nova tabela. Usuários de equipe já têm permissões operacionais próprias, independentemente de serem observadores. Não há envio de e-mails por webhook.
