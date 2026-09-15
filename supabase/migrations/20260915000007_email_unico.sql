-- E-mail de login precisa ser único, e a comparação precisa ignorar maiúsculas.
--
-- A tabela nasceu sem essa restrição. Consequência real: dois usuários podiam
-- existir com o mesmo e-mail, e `app.find_user_for_login` devolveria UM deles —
-- qual, dependeria do plano de execução. Um usuário conseguiria entrar com a
-- senha do outro, ou não conseguiria entrar com a própria, sem explicação.
--
-- Índice sobre `lower(email)` porque ninguém digita o próprio e-mail sempre do
-- mesmo jeito, e `Joao@x.com` e `joao@x.com` são a mesma caixa postal.
--
-- A unicidade é GLOBAL, não por conta: o login acontece antes de existir
-- contexto de conta — é a consulta de login que descobre a conta a partir do
-- e-mail. Fosse único apenas dentro da conta, o login voltaria a ser ambíguo.

create unique index users_email_unico on users (lower(email));
