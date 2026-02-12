-- Tabela de fechamentos mensais por franquia (dados JSON do fechamento)
CREATE TABLE IF NOT EXISTS fechamentos_mensais (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  franquia TEXT NOT NULL,
  mes_referencia INTEGER NOT NULL CHECK (mes_referencia >= 1 AND mes_referencia <= 12),
  ano_referencia INTEGER NOT NULL,
  dados JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(franquia, mes_referencia, ano_referencia)
);

CREATE INDEX IF NOT EXISTS idx_fechamentos_mensais_franquia_mes_ano
  ON fechamentos_mensais (franquia, mes_referencia, ano_referencia);

ALTER TABLE fechamentos_mensais ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for anon" ON fechamentos_mensais
  FOR ALL USING (true) WITH CHECK (true);
