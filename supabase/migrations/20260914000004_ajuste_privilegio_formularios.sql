-- Correção de privilégio excedente.
--
-- A migração 002 concedeu UPDATE em `form_submissions` ao papel `app_forms`,
-- mas o endpoint de formulários apenas INSERE: uma submissão é um fato
-- registrado, não um registro editável. Privilégio que não é usado só amplia a
-- superfície de um eventual erro.
--
-- Idempotente de propósito: num banco onde a 002 nunca chegou a conceder o
-- privilégio, o revoke simplesmente não faz nada.

revoke update on form_submissions from app_forms;
