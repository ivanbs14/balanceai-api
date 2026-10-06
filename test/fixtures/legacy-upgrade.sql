-- Fictitious pre-TECH-020/023 records for a populated migration rehearsal.
INSERT INTO "User" (id, name, document, email, password, role, "createdAt") VALUES
  ('upgrade-user-a', 'Pessoa Fictícia', 'fictitious-upgrade-doc', 'upgrade-a@example.test', 'unused-hash', 'user', NOW());
INSERT INTO "Card" (id, name, "invoiceDate", "limitBalance", "invoicePayment", "userId", "createdAt", "updatedAt") VALUES
  ('upgrade-card-a', 'Cartão Teste', '2026-10-01', 500.00, '2026-10-10', 'upgrade-user-a', NOW(), NOW());
INSERT INTO "Transation" (id, name, type, amount, category, "paymentMethod", "Date", "createdAt", "updatedAt", "userId", "cardId", "nameCard", "paymentStatus", installments, "installmentInfo") VALUES
  ('upgrade-transaction-a', 'Compra teste', 'EXPENSE', 50.00, 'OTHER', 'CREDIT_CARD', '2026-10-01', NOW(), NOW(), 'upgrade-user-a', 'upgrade-card-a', 'Cartão Teste', 'PAID', 2, '1/2'),
  ('upgrade-transaction-b', 'Compra teste', 'EXPENSE', 50.00, 'OTHER', 'CREDIT_CARD', '2026-11-01', NOW(), NOW(), 'upgrade-user-a', 'upgrade-card-a', 'Cartão Teste', 'PENDING', 2, '2/2');
INSERT INTO "FixedCost" (id, "userId", name, "defaultAmount", recurrence, "dueDay", "isActive", "createdAt", "updatedAt", "startDate", category, "paymentMethod") VALUES
  ('upgrade-fixed-a', 'upgrade-user-a', 'Conta teste', 40.00, 'MONTHLY', 31, true, NOW(), NOW(), '2026-10-01', 'UTILITY', 'PIX');
INSERT INTO "FixedCostMonthly" (id, "fixedCostId", competence, status, amount, "createdAt", "updatedAt") VALUES
  ('upgrade-monthly-a', 'upgrade-fixed-a', '2026-10', 'PAID', 40.00, NOW(), NOW());
