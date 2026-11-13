# MktDesk | Projeto React preparado para VS Code

Esta versão organiza o arquivo enviado em um projeto Vite + React + Tailwind, preservando a interface original.

## Rodar localmente
1. Instale Node.js 20.19+ ou 22.12+.
2. Abra esta pasta no VS Code.
3. Execute `npm install` e depois `npm run dev`.
4. Acesse o endereço mostrado no terminal.
5. Verifique o build com `npm run build`.

## IMPORTANTE: não publicar como aplicação corporativa de produção
O código original utiliza localStorage e autenticação implementada no cliente. Firebase não foi conectado e o Supabase ainda não está integrado. Assim, esta entrega serve apenas para desenvolver e visualizar a interface. **Não armazene dados reais ou senhas corporativas.**

## Próxima etapa recomendada
Substituir cadastro/login por Supabase Auth; criar tabelas profiles, tickets, ticket_messages e notifications com RLS; implementar operações de criação/consulta/alteração no Supabase; mover webhooks e códigos de convite para Edge Functions ou outro backend com validação de acesso; só então publicar pela Vercel.

Documentação: https://supabase.com/docs/guides/auth/quickstarts/react e https://vercel.com/docs/frameworks/frontend/vite
