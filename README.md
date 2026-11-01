# Base Planejamento

Aplicação web de planejamento pessoal: tarefas, Mente (captura rápida), notas, reuniões, modo caverna e relatórios. Os dados são enviados ao Supabase com autenticação e regras que isolam os registros de cada pessoa. Não existe armazenamento local de conteúdo; o navegador guarda apenas a sessão de login.

## Configuração

1. Crie um projeto Supabase e execute `schema.sql` no editor SQL.
2. Confira `config.js`, que contém a URL e a chave **publicável** do projeto Supabase. Nunca use a chave `service_role` no navegador.
3. Em Authentication, habilite o login por e-mail/senha. Ajuste a confirmação por e-mail conforme sua preferência.
4. Execute `python3 -m http.server 8000` neste diretório e abra `http://localhost:8000`.

Para publicar, hospede os arquivos estáticos em HTTPS e configure a URL do site em Authentication → URL Configuration. O banco permanece no Supabase. A chave de `config.js` é publicável e deve ser protegida pelas regras de acesso a linhas definidas em `schema.sql`. Os relatórios podem ser vistos e exportados em CSV no aplicativo.

O site anterior no Canva ainda precisa ser analisado antes de migrar seus dados ou afirmar que todos os recursos foram preservados. A importação deve ser definida após identificar a fonte de dados original.
