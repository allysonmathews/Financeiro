-- Adiciona coluna categoria à tabela gastos_fixos_padrao
-- Valores: 'padrao' | 'variavel' | 'esporadico'
ALTER TABLE gastos_fixos_padrao
  ADD COLUMN IF NOT EXISTS categoria TEXT NOT NULL DEFAULT 'padrao'
  CHECK (categoria IN ('padrao', 'variavel', 'esporadico'));

-- Índice para filtrar por categoria
CREATE INDEX IF NOT EXISTS idx_gastos_fixos_padrao_categoria
  ON gastos_fixos_padrao (categoria);
