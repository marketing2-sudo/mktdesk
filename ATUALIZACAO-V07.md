# BravaDesk 0.7 — instalação em projeto existente

Faça um backup do banco e do GitHub antes da atualização. Use um ambiente de teste se possível. Não execute schema.sql nem servicos-sla.sql novamente. A migração v07.sql depende das cinco tabelas da versão anterior e não apaga chamados. Faça a migração e a publicação na mesma janela de manutenção, pois a versão antiga não é compatível com os novos protocolos e notificações.

## 1. Supabase
No SQL Editor, execute supabase/v07.sql inteiro. Se falhar, não prossiga. O script usa uma transação. Em seguida, escolha a conta existente que será Super Admin, conferindo o e-mail antes de executar:

```sql
update public.profiles set role='super_admin'
where id=(select id from auth.users where lower(email)=lower('SEU_EMAIL@EMPRESA.COM.BR'))
  and role='admin' and active
returning id, role;
```

Confirme que retornou uma linha. Habilite confirmação de e-mail e configure SMTP de autenticação antes de liberar convites (se a confirmação estiver desabilitada, a titularidade do e-mail não é verificada). Convites de 48h e uso único são criados na aba Equipe; só Super Admin convida administradores. Técnicos existentes permanecem técnicos.

## 2. GitHub / Vercel
Envie todo o conteúdo do ZIP na raiz do repositório, mantendo src/, public/, api/ e package.json. Confira o novo commit e deploy Ready. Mantenha as duas variáveis VITE_SUPABASE existentes. O app já terá notificações internas sem configurar push. O protocolo é atribuído pela sequência no banco; os números antigos permanecem. A sequência pode ter lacunas após transações abortadas.

## 3. Push opcional (aplicativo fechado)
Adicione na Vercel: VITE_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto: endereço técnico válido), SUPABASE_SERVICE_ROLE_KEY (chave service_role legada apenas no servidor). Nunca prefixe as duas chaves privadas com VITE_ nem as coloque no GitHub. Gere um par VAPID usando `npx web-push generate-vapid-keys` em um ambiente Node confiável (por exemplo GitHub Codespaces, sem Node local). Guarde a chave privada em segredo. Redeploy após configurar. Cada usuário deve abrir Preferências de notificações e ativar push. iPhone: PWA instalado e versão iOS compatível com Web Push. Android: navegador compatível. Som/vibração do push seguem ajustes do sistema operacional. O envio é iniciado pelo cliente após salvar um chamado, e é melhor esforço, sem fila de reenvio; falhas de rede podem impedir push, mas não a notificação interna. Nenhum e-mail de chamado é enviado.

## 4. Teste antes de liberar
- Criar chamado em duas contas, conferir protocolos distintos no banco.
- Assumir, pedir informação, responder, aprovar, conferir notificações em ambas contas.
- Testar convite para e-mail correto e incorreto, expirado e usado; testar admin tentando modificar Super Admin.
- Testar som/vibração e push em dois aparelhos, incluindo app fechado.
- Conferir dashboard 85%, catálogo e SLAs.

## Limitações
Sintaxe JSX/JS validada; build completo, SQL em banco real e push não testados. A base ainda embute notas internas no JSON dos chamados; a filtragem da interface não garante sigilo no banco. Não use notas confidenciais até separar as notas em tabela protegida. Não há alertas automáticos de SLA por tempo nem fila de reenvio. Cobrança manual e importação de backup pela interface foram desativadas nesta versão; exportação continua disponível. O cadastro de múltiplos setores não foi implementado. E-mails de autenticação são independentes e continuam no Supabase.
