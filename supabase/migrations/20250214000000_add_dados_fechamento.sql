-- Coluna para o objeto final do fechamento (regras contábeis)
ALTER TABLE fechamentos_mensais
  ADD COLUMN IF NOT EXISTS dados_fechamento JSONB;
