# BravaDesk v0.7.3 — Anexos de referência

Base: v0.7.2. Não recrie o banco. Faça backup e publique em janela de manutenção.

1. Execute todo `supabase/v073.sql` no SQL Editor antes de publicar o frontend. Ele cria o bucket privado `bd-references`, políticas Storage e a RPC `bd_post_reference_message`.
2. No GitHub, substitua `src/App.jsx`, adicione `src/references.jsx` e substitua `package.json`. Verifique o deploy Production na Vercel. Nenhuma chave nova é necessária.
3. Teste abertura com PNG/PDF, envio de mensagem só com imagem, Ctrl+V no texto, arrastar arquivos, download e visualização. Limite 5 por envio e 10 MiB por arquivo. HEIC não é aceito; converta em JPG/PNG.
4. Teste com solicitante, observador, técnico e usuário alheio: observador lê somente anexos públicos de seus chamados, não envia; arquivos privados de notas são exclusivos da equipe. Confirme push de mensagens públicas e ausência de aviso para notas privadas. Teste também envio de texto sem arquivo e entrega final por Drive.
5. A abertura com anexos usa duas operações: primeiro cria o chamado; depois envia referências como mensagem, também exibida no briefing. Se o upload falhar, o chamado permanece aberto e o usuário deve reenviar as referências no chat. Se upload ou gravação falhar podem permanecer arquivos órfãos, que precisam de limpeza administrativa pelo Storage. Não exclua arquivos associados a demandas.

Não foi executado build completo nem teste contra o Supabase real. Validação local limitada à sintaxe JSX e integridade dos pacotes. Não há antivírus, validação de conteúdo binário ou barra de progresso percentual nesta versão. Os limites do projeto Supabase continuam aplicáveis. O acesso de leitura depende da sessão e das políticas do banco. Não torne o bucket público. As chaves VAPID e o webhook removido não mudam.
