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

## Novo: Gestão de Serviços e SLAs (versão 0.2)

1. No Supabase **SQL Editor**, execute **`supabase/servicos-sla.sql`**. Já tendo executado `schema.sql`, não precisa executar o original novamente.
2. Atualize os arquivos desta pasta no GitHub e confira o deploy na Vercel.
3. Entre como **Administrador** no MktDesk e abra **Configurações**.
4. Em **Gestão de Serviços e SLAs**, cadastre, edite ou desative serviços. Informe o tempo em **horas corridas**. O prazo de cada chamado é fixado quando ele é criado, portanto alterações futuras no catálogo não mudam o histórico.
5. Em **Status personalizados**, crie etapas como *Em revisão* ou *Aguardando fornecedor*. Escolha a qual status do fluxo elas pertencem. As etapas **não substituem** os estados operacionais principais (triagem, produção, SAC, aprovação e conclusão), para preservar a lógica de pausa de SLA e aprovação pelo solicitante.
6. Clique em **Salvar Configurações** no topo da página para persistir no Supabase. Sem esse clique, as alterações ainda não são gravadas.
7. Abra um chamado e, como Administrador ou Técnico, utilize **Etapa personalizada** no detalhamento. A etapa aparecerá na identificação do chamado, preservando a coluna principal do Kanban.
8. Teste criando um chamado com um novo serviço. Confira `tickets` no Table Editor do Supabase e veja `data.categoryName` e `data.slaHours`.

### Limitações importantes
- O SLA atual é **em horas corridas**, não em horas úteis ou por expediente.
- Etapas personalizadas são **substatus** relacionados a um dos estados principais. Para construir um fluxo totalmente livre com gatilhos de pausa, aprovação, fechamento e permissões por transição, seria necessária uma migração mais abrangente.
- A funcionalidade de **convites individuais** discutida anteriormente não foi implementada neste pacote. Não considere os códigos da interface antiga como convites seguros.
- Migração dos chamados existentes e notificações por e-mail não foram alteradas.
- A sintaxe JSX foi analisada, mas o build completo depende do ambiente Vercel (instalação de dependências indisponível nesta sessão).


## Versão 0.3: atualização visual e correção de publicação

- Na aba do administrador agora aparece **Serviços, Status & Configurações**.
- No topo das configurações aparece o selo **Versão 0.3**, com atalhos **Cadastrar serviços e prazos** e **Cadastrar status**.
- O botão **Salvar Configurações** exibe um erro se a gravação no Supabase falhar, em vez de sinalizar sucesso.
- O formulário conserva a situação ativo/inativo ao editar um serviço ou status.

### Muito importante ao atualizar pelo navegador no GitHub

O ZIP tem arquivos na **raiz** (`src`, `supabase`, `package.json`, `index.html`). Atualize os arquivos nos mesmos caminhos do repositório. O GitHub pela interface web pode **não substituir arquivos existentes automaticamente** se o upload for feito por uma pasta errada. Confirme que `src/App.jsx` do repositório contém a expressão `Versão 0.3`. Depois faça commit e confira o deployment do commit correto na Vercel.

Não execute novamente `schema.sql` se as tabelas já existem. O SQL adicional `supabase/servicos-sla.sql` também não precisa ser repetido se já foi executado com sucesso.

**Limites:** status personalizados são subetapas do fluxo existente, não alteram automaticamente a pausa do SLA. Convites individuais continuam fora do escopo desta entrega. A segurança das políticas de chamados/notificações e webhooks exige revisão antes do uso em produção com dados reais.
