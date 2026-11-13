# MktDesk com Supabase + Vercel

Versão migrada a partir do MktDesk React original. A interface dos chamados, SLA, BI e Kanban foi preservada. Firebase e armazenamento local de dados corporativos foram substituídos por Supabase Auth e tabelas PostgreSQL com RLS. Preferência de som permanece local.

## Passo a passo SEM instalar Node.js no Windows

1. Em https://supabase.com/dashboard crie um projeto e abra **SQL Editor > New query**.
2. Cole e execute o arquivo **`supabase/schema.sql`** integralmente.
3. Em **Project Settings > API Keys**, copie a chave **publishable** (`sb_publishable_...`) ou, em projetos legados, a chave **anon**, e em **Connect / Project Settings > API** copie a URL do projeto. **Nunca use `service_role`/secret key no Vite.**
4. Envie os arquivos desta pasta para seu repositório GitHub, substituindo o projeto anterior.
5. Em **Vercel > Project > Settings > Environment Variables**, crie as duas variáveis:
   - `VITE_SUPABASE_URL` = URL do projeto
   - `VITE_SUPABASE_PUBLISHABLE_KEY` = chave publishable (ou anon)
   Aplique nos ambientes desejados e faça **Redeploy**.
6. Em **Supabase > Authentication > URL Configuration**, configure **Site URL** com o domínio oficial da Vercel e adicione o domínio em **Redirect URLs** (ex.: `https://seu-mktdesk.vercel.app/**`). Em **Providers > Email**, configure confirmação de e-mail conforme sua operação.
7. Abra a URL do sistema e use **Cadastrar**. Confirme seu e-mail se solicitado.
8. Para definir o **primeiro administrador**, volte ao SQL Editor e execute, após substituir pelo seu endereço real:

```sql
update public.profiles set role='admin'
where id=(select id from auth.users where email='SEU_EMAIL@EMPRESA.COM.BR');
```

9. Atualize o navegador. Depois disso, o administrador pode promover outros usuários já cadastrados na aba **Equipe**. Os papéis são impostos no banco por RLS, não por códigos JS.

## Atenções

- **Não migra automaticamente registros antigos do localStorage ou Firebase.** Faça backup antes de substituir seu deploy anterior. O botão de importação de backup pode exigir ajustes para usuários, porque usuários novos precisam existir previamente no Supabase Auth e ter UUID correspondente. Não importe hashes de senha antigos.
- **Webhooks/e-mail:** disparo direto do navegador foi desativado por segurança. Para e-mails reais, configurar uma Supabase Edge Function com segredo no servidor.
- **Cadastro direto de usuário pelo administrador:** não cria mais contas com senha definida pelo admin. A pessoa se cadastra com a própria senha; o admin altera sua função em Equipe. A UI antiga de cadastro direto informa essa restrição.
- Ative **Supabase Auth > Rate Limits / CAPTCHA / SMTP** para proteção e entrega de e-mails em produção.
- **Atenção sobre limites de permissões:** as políticas são uma primeira camada de proteção. Antes de liberar para muitos usuários, revise a autorização de notificações, a validação detalhada de alterações em chamados e os logs. Não assuma auditoria ou e-mail transacional implementados.
- Essa versão **não teve build de dependências validado** nesta execução por indisponibilidade de instalação de pacotes. O build ocorrerá na Vercel e poderá apontar ajustes necessários.

## Arquivos

- `src/App.jsx`: React preservado e migrado
- `src/supabase.js`: conexão Supabase
- `supabase/schema.sql`: banco, trigger de cadastro, RLS e Realtime
- `.env.example`: nomes das variáveis da Vercel
