-- Renomeia coluna franquia para franquia_id (nome correto no banco)
ALTER TABLE fechamentos_mensais RENAME COLUMN franquia TO franquia_id;

-- Recria o índice com o novo nome da coluna
DROP INDEX IF EXISTS idx_fechamentos_mensais_franquia_mes_ano;
CREATE INDEX IF NOT EXISTS idx_fechamentos_mensais_franquia_id_mes_ano
  ON fechamentos_mensais (franquia_id, mes_referencia, ano_referencia);

-- A constraint UNIQUE(franquia, ...) foi renomeada automaticamente com a coluna no PostgreSQL.
-- Se existir constraint com nome antigo, recriar:
-- ALTER TABLE fechamentos_mensais DROP CONSTRAINT IF EXISTS fechamentos_mensais_franquia_mes_referencia_ano_referencia_key;
-- ALTER TABLE fechamentos_mensais ADD UNIQUE (franquia_id, mes_referencia, ano_referencia);
