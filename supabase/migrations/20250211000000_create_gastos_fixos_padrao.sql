-- Tabela de gastos fixos padrão para condomínios
CREATE TABLE IF NOT EXISTS gastos_fixos_padrao (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fornecedor TEXT NOT NULL,
  valor NUMERIC NOT NULL CHECK (valor >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índice para listagens ordenadas
CREATE INDEX IF NOT EXISTS idx_gastos_fixos_padrao_created_at
  ON gastos_fixos_padrao (created_at DESC);

-- Habilitar RLS (Row Level Security) se quiser políticas depois
ALTER TABLE gastos_fixos_padrao ENABLE ROW LEVEL SECURITY;

-- Política permissiva para anon (ajuste conforme sua autenticação)
CREATE POLICY "Allow all for anon" ON gastos_fixos_padrao
  FOR ALL USING (true) WITH CHECK (true);
