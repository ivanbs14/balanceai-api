import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  PrismaClient,
  TransationCategory,
  TransationPaymentMethod,
  TransationType,
} from '@prisma/client';

type SourceKind = 'FIXED' | 'MONTHLY' | 'CARD' | 'INCOME';

type CliOptions = {
  dryRun: boolean;
  dataPath: string;
  userId?: string;
  userEmail?: string;
  year?: number;
  defaultCardName: string;
  createMissingCards: boolean;
  repairFixed: boolean;
  syncUser: boolean;
};

type ParsedTx = {
  source: SourceKind;
  sourceFile: string;
  rowNumber: number;
  name: string;
  amount: number;
  type: TransationType;
  withdrawal: TransationType | null;
  category: TransationCategory;
  paymentMethod: TransationPaymentMethod;
  paymentRaw: string;
  isFixed: boolean;
  installments?: number;
  installmentInfo?: string;
  date: Date;
  cardName?: string;
};

type ImportStats = {
  parsed: number;
  duplicatesInFile: number;
  duplicatesInDb: number;
  inserted: number;
  deleted: number;
  existingInDb: number;
  bySource: Record<SourceKind, number>;
  byFile: Record<string, number>;
};

type PreparedRecord = {
  data: {
    name: string;
    userId: string;
    type: TransationType;
    amount: string;
    category: TransationCategory;
    paymentMethod: TransationPaymentMethod;
    isFixed: boolean;
    installments?: number;
    installmentInfo?: string;
    nameCard?: string;
    cardId?: string;
    Date: Date;
    withdrawal?: TransationType | null;
  };
  key: string;
  source: SourceKind;
  fileName: string;
};

const prisma = new PrismaClient();

function loadLocalEnvFile() {
  const envPath = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) {
    return;
  }

  const raw = fs.readFileSync(envPath, 'utf8');
  const lines = raw.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex <= 0) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

const MONTH_MAP: Record<string, number> = {
  janeiro: 1,
  fevereiro: 2,
  marco: 3,
  abril: 4,
  maio: 5,
  junho: 6,
  julho: 7,
  agosto: 8,
  setembro: 9,
  outubro: 10,
  novembro: 11,
  dezembro: 12,
};

const SUMMARY_NAMES = new Set(
  [
    '',
    'nome',
    'total',
    'total:',
    'fixos',
    'gastos do mes',
    'cartao de credito',
    'total de cartao de credito',
    'entradas',
    'saidas',
    'saldo:',
    'gastos por tipo de pagamento',
    'renda fixa',
    'caixinha',
    'reserva',
  ].map((item) => normalizeKey(item))
);

const INCOME_EXCLUDED_NAMES = new Set(
  [
    'debito',
    'inter',
    'nubank',
    'santander',
    'saldo:',
    'total:',
    'reserva',
    'renda fixa',
    'caixinha',
    'credito 4',
  ].map((item) => normalizeKey(item))
);

const CARD_ALIAS_TO_CANONICAL: Record<string, string> = {
  inter: 'Inter',
  nubank: 'Nubank',
  santander: 'Santander',
  'credito 4': 'Crédito 4',
  credito4: 'Crédito 4',
  'crédito 4': 'Crédito 4',
};

function normalizeText(value: string | undefined | null): string {
  return (value ?? '').trim().replace(/\s+/g, ' ');
}

function normalizeKey(value: string | undefined | null): string {
  return normalizeText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function parseCliOptions(): CliOptions {
  const args = process.argv.slice(2);

  const options: CliOptions = {
    dryRun: false,
    dataPath: path.resolve(process.cwd(), '../dados/bkpcsv'),
    userEmail: 'seed@balance.local',
    defaultCardName: 'Crédito 4',
    createMissingCards: true,
    repairFixed: false,
    syncUser: false,
  };

  for (const arg of args) {
    if (arg === '--dry-run') {
      options.dryRun = true;
      continue;
    }
    if (arg === '--no-create-missing-cards') {
      options.createMissingCards = false;
      continue;
    }
    if (arg === '--repair-fixed') {
      options.repairFixed = true;
      continue;
    }
    if (arg === '--sync-user') {
      options.syncUser = true;
      continue;
    }
    if (arg.startsWith('--path=')) {
      options.dataPath = path.resolve(process.cwd(), arg.replace('--path=', ''));
      continue;
    }
    if (arg.startsWith('--user-id=')) {
      options.userId = arg.replace('--user-id=', '').trim();
      continue;
    }
    if (arg.startsWith('--user-email=')) {
      options.userEmail = arg.replace('--user-email=', '').trim();
      continue;
    }
    if (arg.startsWith('--year=')) {
      const year = Number(arg.replace('--year=', '').trim());
      if (!Number.isInteger(year) || year < 1900) {
        throw new Error(`Valor inválido para --year: ${arg}`);
      }
      options.year = year;
      continue;
    }
    if (arg.startsWith('--default-card=')) {
      options.defaultCardName = normalizeText(arg.replace('--default-card=', ''));
      continue;
    }
  }

  return options;
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      const nextChar = line[i + 1];
      if (inQuotes && nextChar === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      cells.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  cells.push(current);
  return cells;
}

function parseBrl(value: string | undefined): number | null {
  if (!value) return null;
  const cleaned = normalizeText(value).replace(/\s/g, '');
  if (!cleaned.includes('R$')) return null;

  const numericPart = cleaned.replace('R$', '').replace(/\./g, '').replace(',', '.');
  const parsed = Number(numericPart);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseInstallments(value: string | undefined): { total: number; info: string } | null {
  const raw = normalizeText(value);
  const match = raw.match(/^(\d{1,2})\s*\/\s*(\d{1,2})$/);
  if (!match) return null;

  const current = Number(match[1]);
  const total = Number(match[2]);
  if (!Number.isInteger(current) || !Number.isInteger(total) || total < 1) {
    return null;
  }

  return {
    total,
    info: `${current}/${total}`,
  };
}

function parseDay(value: string | undefined, fallback: number): number {
  const raw = normalizeText(value);
  if (!/^\d{1,2}$/.test(raw)) return fallback;

  const day = Number(raw);
  if (!Number.isInteger(day) || day < 1 || day > 31) return fallback;
  return day;
}

function isSummaryName(name: string): boolean {
  return SUMMARY_NAMES.has(normalizeKey(name));
}

function parseYearMonthFromFilename(fileName: string): { year: number; month: number } {
  const base = path.basename(fileName);
  const match = base.match(/^(\d{4})\s*-\s*([^\.]+)\.csv$/i);

  if (!match) {
    throw new Error(`Não foi possível extrair ano/mês do nome do arquivo: ${base}`);
  }

  const year = Number(match[1]);
  const monthName = normalizeKey(match[2]);
  const month = MONTH_MAP[monthName];

  if (!month) {
    throw new Error(`Mês não reconhecido no arquivo ${base}: ${match[2]}`);
  }

  return { year, month };
}

function rowContainsValue(row: string[], value: string): boolean {
  const target = normalizeKey(value);
  return row.some((cell) => normalizeKey(cell) === target);
}

function createDate(year: number, month: number, day: number): Date {
  return new Date(year, month - 1, day);
}

function mapCategory(rawCategory: string, type: TransationType, rawName: string): TransationCategory {
  const category = normalizeKey(rawCategory);
  const name = normalizeKey(rawName);

  if (type === TransationType.DEPOSIT && /salario|salário|bolsa/.test(name)) {
    return TransationCategory.SALARY;
  }

  if (category.includes('aluguel')) return TransationCategory.HOUSING;
  if (category.includes('mercado') || category.includes('ifood')) return TransationCategory.FOOD;
  if (category.includes('uber') || category.includes('transporte') || category.includes('viagem')) {
    return TransationCategory.TRANSPORTION;
  }
  if (category.includes('lazer') || category.includes('presentes')) {
    return TransationCategory.ENTERTAINMENT;
  }
  if (category.includes('saude') || category.includes('saúde')) return TransationCategory.HEALTH;
  if (category.includes('contas') || category.includes('assinaturas') || category.includes('imposto')) {
    return TransationCategory.UTILITY;
  }
  if (category.includes('desenvolvimento') || category.includes('necessidades')) {
    return TransationCategory.EDUCATION;
  }

  if (type === TransationType.DEPOSIT && /salario|salário/.test(name)) {
    return TransationCategory.SALARY;
  }

  return TransationCategory.OTHER;
}

function mapPaymentMethod(rawPayment: string, source: SourceKind): TransationPaymentMethod {
  if (source === 'CARD') {
    return TransationPaymentMethod.CREDIT_CARD;
  }

  const payment = normalizeKey(rawPayment);
  if (!payment) return TransationPaymentMethod.OTHER;

  if (payment.includes('debito') || payment.includes('débito')) {
    return TransationPaymentMethod.DEBIT_CARD;
  }
  if (payment.includes('pix')) return TransationPaymentMethod.PIX;
  if (payment.includes('dinheiro') || payment.includes('cash')) {
    return TransationPaymentMethod.CASH;
  }
  if (
    payment.includes('nubank') ||
    payment.includes('inter') ||
    payment.includes('santander') ||
    payment.includes('credito 4') ||
    payment.includes('crédito 4')
  ) {
    return TransationPaymentMethod.CREDIT_CARD;
  }
  if (payment.includes('reserva') || payment.includes('transfer')) {
    return TransationPaymentMethod.Bank_Transfer;
  }

  return TransationPaymentMethod.OTHER;
}

function inferTypeFromExpenseBlock(rawName: string, rawCategory: string, rawPayment: string): TransationType {
  const name = normalizeKey(rawName);
  const category = normalizeKey(rawCategory);
  const payment = normalizeKey(rawPayment);

  if (name.includes('invest') || category.includes('invest') || payment.includes('reserva')) {
    return TransationType.INVESTMENT;
  }

  return TransationType.EXPENSE;
}

function inferTypeFromIncomeBlock(rawName: string): TransationType {
  const name = normalizeKey(rawName);
  if (name.includes('invest') || name.includes('reserva')) {
    return TransationType.INVESTMENT;
  }
  return TransationType.DEPOSIT;
}

function resolveCardName(rawPayment: string, defaultCardName: string): string {
  const normalized = normalizeKey(rawPayment);
  if (CARD_ALIAS_TO_CANONICAL[normalized]) {
    return CARD_ALIAS_TO_CANONICAL[normalized];
  }

  if (normalized.includes('nubank')) return 'Nubank';
  if (normalized.includes('inter')) return 'Inter';
  if (normalized.includes('santander')) return 'Santander';
  if (normalized.includes('credito 4') || normalized.includes('crédito 4')) {
    return 'Crédito 4';
  }

  return defaultCardName;
}

function isValidTransactionName(name: string): boolean {
  const normalized = normalizeKey(name);
  if (!normalized) return false;
  if (normalized === 'false' || normalized === 'true') return false;
  return !isSummaryName(name);
}

function parseFixedRow(row: string[], fileName: string, rowNumber: number, year: number, month: number): ParsedTx | null {
  const name = normalizeText(row[2]);
  const amount = parseBrl(row[8]);
  if (!isValidTransactionName(name) || amount === null) return null;

  const paymentRaw = normalizeText(row[6]);
  const categoryRaw = normalizeText(row[7]);
  const installments = parseInstallments(row[3]);
  const day = parseDay(row[5], 1);
  const type = inferTypeFromExpenseBlock(name, categoryRaw, paymentRaw);

  return {
    source: 'FIXED',
    sourceFile: fileName,
    rowNumber,
    name,
    amount,
    type,
    withdrawal: type === TransationType.EXPENSE ? TransationType.DEPOSIT : null,
    category: mapCategory(categoryRaw, type, name),
    paymentMethod: mapPaymentMethod(paymentRaw, 'FIXED'),
    paymentRaw,
    isFixed: true,
    installments: installments?.total,
    installmentInfo: installments?.info,
    date: createDate(year, month, day),
    cardName: undefined,
  };
}

function parseMonthlyRow(
  row: string[],
  fileName: string,
  rowNumber: number,
  year: number,
  month: number
): ParsedTx | null {
  const name = normalizeText(row[10]);
  const amount = parseBrl(row[14]);
  if (!isValidTransactionName(name) || amount === null) return null;

  const paymentRaw = normalizeText(row[12]);
  const categoryRaw = normalizeText(row[13]);
  const day = parseDay(row[11], 15);
  const type = inferTypeFromExpenseBlock(name, categoryRaw, paymentRaw);

  return {
    source: 'MONTHLY',
    sourceFile: fileName,
    rowNumber,
    name,
    amount,
    type,
    withdrawal: type === TransationType.EXPENSE ? TransationType.DEPOSIT : null,
    category: mapCategory(categoryRaw, type, name),
    paymentMethod: mapPaymentMethod(paymentRaw, 'MONTHLY'),
    paymentRaw,
    isFixed: false,
    date: createDate(year, month, day),
    cardName: undefined,
  };
}

function parseCardRow(row: string[], fileName: string, rowNumber: number, year: number, month: number): ParsedTx | null {
  const name = normalizeText(row[2]);
  const amount = parseBrl(row[8]);
  const installments = parseInstallments(row[3]);
  if (!isValidTransactionName(name) || amount === null || !installments) return null;

  const paymentRaw = normalizeText(row[6]);
  const categoryRaw = normalizeText(row[7]);
  const day = parseDay(row[5], 10);
  const type = inferTypeFromExpenseBlock(name, categoryRaw, paymentRaw);

  return {
    source: 'CARD',
    sourceFile: fileName,
    rowNumber,
    name,
    amount,
    type,
    withdrawal: type === TransationType.EXPENSE ? TransationType.DEPOSIT : null,
    category: mapCategory(categoryRaw, type, name),
    paymentMethod: TransationPaymentMethod.CREDIT_CARD,
    paymentRaw,
    isFixed: false,
    installments: installments.total,
    installmentInfo: installments.info,
    date: createDate(year, month, day),
    cardName: undefined,
  };
}

function parseIncomeRow(row: string[], fileName: string, rowNumber: number, year: number, month: number): ParsedTx | null {
  const name = normalizeText(row[16]);
  const amount = parseBrl(row[17]);
  if (!name || amount === null) return null;

  const normalized = normalizeKey(name);
  if (isSummaryName(name) || INCOME_EXCLUDED_NAMES.has(normalized)) {
    return null;
  }

  const type = inferTypeFromIncomeBlock(name);
  const day = parseDay(row[18], 1);

  return {
    source: 'INCOME',
    sourceFile: fileName,
    rowNumber,
    name,
    amount,
    type,
    withdrawal: null,
    category: mapCategory('', type, name),
    paymentMethod: TransationPaymentMethod.OTHER,
    paymentRaw: 'Entradas',
    isFixed: false,
    date: createDate(year, month, day),
    cardName: undefined,
  };
}

function buildDedupKey(tx: {
  userId: string;
  name: string;
  amount: number | string;
  type: TransationType;
  category: TransationCategory;
  paymentMethod: TransationPaymentMethod;
  installments?: number | null;
  installmentInfo?: string | null;
  cardId?: string | null;
  Date: Date;
}): string {
  const amount = typeof tx.amount === 'number' ? tx.amount.toFixed(2) : Number(tx.amount).toFixed(2);
  const dateKey = `${tx.Date.getFullYear()}-${String(tx.Date.getMonth() + 1).padStart(2, '0')}-${String(
    tx.Date.getDate()
  ).padStart(2, '0')}`;

  return [
    tx.userId,
    normalizeKey(tx.name),
    amount,
    tx.type,
    tx.category,
    tx.paymentMethod,
    tx.installments ?? '',
    tx.installmentInfo ?? '',
    tx.cardId ?? '',
    dateKey,
  ].join('|');
}

async function ensureCardByName(
  userId: string,
  cardName: string,
  cardMap: Map<string, { id: string; name: string }>,
  dryRun: boolean,
  createMissingCards: boolean
): Promise<{ id: string; name: string } | null> {
  const key = normalizeKey(cardName);
  const existing = cardMap.get(key);
  if (existing) return existing;

  if (!createMissingCards) {
    return null;
  }

  if (dryRun) {
    return {
      id: `DRY-RUN-${key}`,
      name: cardName,
    };
  }

  const invoiceDate = new Date();
  invoiceDate.setDate(1);

  const invoicePayment = new Date();
  invoicePayment.setDate(10);

  const created = await prisma.card.create({
    data: {
      userId,
      name: cardName,
      invoiceDate,
      invoicePayment,
      limitBalance: '0.00',
    },
    select: {
      id: true,
      name: true,
    },
  });

  cardMap.set(key, created);
  return created;
}

async function main() {
  loadLocalEnvFile();
  const options = parseCliOptions();

  if (!fs.existsSync(options.dataPath)) {
    throw new Error(`Pasta de CSV não encontrada: ${options.dataPath}`);
  }

  const fileNames = fs
    .readdirSync(options.dataPath)
    .filter((name) => name.toLowerCase().endsWith('.csv'))
    .sort((a, b) => a.localeCompare(b, 'pt-BR'));

  if (fileNames.length === 0) {
    throw new Error(`Nenhum arquivo CSV encontrado em: ${options.dataPath}`);
  }

  const user = options.userId
    ? await prisma.user.findUnique({ where: { id: options.userId } })
    : await prisma.user.findUnique({ where: { email: options.userEmail ?? '' } });

  if (!user) {
    throw new Error(
      options.userId
        ? `Usuário não encontrado para --user-id=${options.userId}`
        : `Usuário não encontrado para --user-email=${options.userEmail}`
    );
  }

  const cards = await prisma.card.findMany({
    where: { userId: user.id },
    select: {
      id: true,
      name: true,
    },
  });

  const cardMap = new Map(cards.map((card) => [normalizeKey(card.name), card]));

  const parsedTransactions: ParsedTx[] = [];

  for (const fileName of fileNames) {
    const { year, month } = parseYearMonthFromFilename(fileName);
    if (options.year && year !== options.year) {
      continue;
    }

    const fullPath = path.join(options.dataPath, fileName);
    const lines = fs.readFileSync(fullPath, 'utf8').split(/\r?\n/);
    let inCardSection = false;

    lines.forEach((line, index) => {
      if (!line.trim()) return;
      const row = parseCsvLine(line);
      const rowNumber = index + 1;

      if (rowContainsValue(row, 'Cartão de Crédito')) {
        inCardSection = true;
      }

      const parsedRows = (
        inCardSection
          ? [parseCardRow(row, fileName, rowNumber, year, month)]
          : [
              parseFixedRow(row, fileName, rowNumber, year, month),
              parseMonthlyRow(row, fileName, rowNumber, year, month),
              parseIncomeRow(row, fileName, rowNumber, year, month),
            ]
      ).filter((item): item is ParsedTx => item !== null);

      parsedTransactions.push(...parsedRows);
    });
  }

  if (options.repairFixed) {
    const seenRepairKeys = new Set<string>();
    const fixedTransactions = parsedTransactions.filter((item) => item.source === 'FIXED');
    let updatedRows = 0;

    for (const item of fixedTransactions) {
      let cardId: string | undefined;
      let nameCard: string | undefined;

      if (item.paymentMethod === TransationPaymentMethod.CREDIT_CARD) {
        const desiredCardName = resolveCardName(item.paymentRaw, options.defaultCardName);
        const card = await ensureCardByName(
          user.id,
          desiredCardName,
          cardMap,
          false,
          options.createMissingCards
        );

        if (card) {
          cardId = card.id;
          nameCard = card.name;
        } else {
          nameCard = desiredCardName;
        }
      }

      const data = {
        name: item.name,
        userId: user.id,
        type: item.type,
        amount: item.amount.toFixed(2),
        category: item.category,
        paymentMethod: item.paymentMethod,
        isFixed: true,
        installments: item.installments,
        installmentInfo: item.installmentInfo,
        nameCard,
        cardId,
        Date: item.date,
        withdrawal: item.withdrawal,
      };

      const repairKey = buildDedupKey({
        userId: data.userId,
        name: data.name,
        amount: Number(data.amount),
        type: data.type,
        category: data.category,
        paymentMethod: data.paymentMethod,
        installments: data.installments,
        installmentInfo: data.installmentInfo,
        cardId: data.cardId,
        Date: data.Date,
      });

      if (seenRepairKeys.has(repairKey)) {
        continue;
      }

      seenRepairKeys.add(repairKey);

      const result = await prisma.transation.updateMany({
        where: {
          userId: data.userId,
          name: data.name,
          amount: data.amount,
          type: data.type,
          category: data.category,
          paymentMethod: data.paymentMethod,
          installments: data.installments ?? null,
          installmentInfo: data.installmentInfo ?? null,
          cardId: data.cardId ?? null,
          Date: data.Date,
          isFixed: false,
        },
        data: {
          isFixed: true,
        },
      });

      updatedRows += result.count;
    }

    console.log('');
    console.log('Reparo de transações fixas');
    console.log(`Usuário: ${user.email} (${user.id})`);
    console.log(`Registros fixos identificados no CSV: ${fixedTransactions.length}`);
    console.log(`Registros fixos únicos para reparo: ${seenRepairKeys.size}`);
    console.log(`Linhas atualizadas (isFixed=false -> true): ${updatedRows}`);
    return;
  }

  const existing = await prisma.transation.findMany({
    where: { userId: user.id },
    select: {
      userId: true,
      name: true,
      amount: true,
      type: true,
      category: true,
      paymentMethod: true,
      installments: true,
      installmentInfo: true,
      cardId: true,
      Date: true,
    },
  });

  const existingKeys = new Set(
    existing.map((item) =>
      buildDedupKey({
        ...item,
        amount: Number(item.amount),
      })
    )
  );

  const seenInBatch = new Set<string>();
  const canonicalRecords: PreparedRecord[] = [];

  const stats: ImportStats = {
    parsed: parsedTransactions.length,
    duplicatesInFile: 0,
    duplicatesInDb: 0,
    inserted: 0,
    deleted: 0,
    existingInDb: existing.length,
    bySource: {
      FIXED: 0,
      MONTHLY: 0,
      CARD: 0,
      INCOME: 0,
    },
    byFile: {},
  };

  for (const item of parsedTransactions) {
    let cardId: string | undefined;
    let nameCard: string | undefined;

    if (item.paymentMethod === TransationPaymentMethod.CREDIT_CARD) {
      const desiredCardName = resolveCardName(item.paymentRaw, options.defaultCardName);
      const card = await ensureCardByName(
        user.id,
        desiredCardName,
        cardMap,
        options.dryRun,
        options.createMissingCards
      );

      if (card) {
        cardId = card.id.startsWith('DRY-RUN-') ? undefined : card.id;
        nameCard = card.name;
      } else {
        nameCard = desiredCardName;
      }
    }

    const data = {
      name: item.name,
      userId: user.id,
      type: item.type,
      amount: item.amount.toFixed(2),
      category: item.category,
      paymentMethod: item.paymentMethod,
      isFixed: item.isFixed,
      installments: item.installments,
      installmentInfo: item.installmentInfo,
      nameCard,
      cardId,
      Date: item.date,
      withdrawal: item.withdrawal,
    };

    const key = buildDedupKey({
      userId: data.userId,
      name: data.name,
      amount: Number(data.amount),
      type: data.type,
      category: data.category,
      paymentMethod: data.paymentMethod,
      installments: data.installments,
      installmentInfo: data.installmentInfo,
      cardId: data.cardId,
      Date: data.Date,
    });

    if (seenInBatch.has(key)) {
      stats.duplicatesInFile += 1;
      continue;
    }

    seenInBatch.add(key);
    canonicalRecords.push({
      data,
      key,
      source: item.source,
      fileName: item.sourceFile,
    });
  }

  let recordsToInsert = canonicalRecords;

  if (options.syncUser) {
    stats.deleted = existing.length;
    stats.duplicatesInDb = existing.filter((item) =>
      seenInBatch.has(
        buildDedupKey({
          ...item,
          amount: Number(item.amount),
        })
      )
    ).length;

    if (!options.dryRun) {
      await prisma.$transaction(
        async (tx) => {
          await tx.transation.deleteMany({
            where: { userId: user.id },
          });

          for (const chunkStart of Array.from(
            { length: Math.ceil(recordsToInsert.length / 100) },
            (_, i) => i * 100
          )) {
            const chunk = recordsToInsert.slice(chunkStart, chunkStart + 100);
            await tx.transation.createMany({
              data: chunk.map((record) => record.data),
            });
          }
        },
        {
          maxWait: 10000,
          timeout: 60000,
        }
      );
    }
  } else {
    recordsToInsert = canonicalRecords.filter((record) => {
      if (existingKeys.has(record.key)) {
        stats.duplicatesInDb += 1;
        return false;
      }

      return true;
    });

    if (!options.dryRun) {
      for (const chunkStart of Array.from({ length: Math.ceil(recordsToInsert.length / 100) }, (_, i) => i * 100)) {
        const chunk = recordsToInsert.slice(chunkStart, chunkStart + 100);
        await prisma.$transaction(
          chunk.map((record) =>
            prisma.transation.create({
              data: record.data,
            })
          )
        );
      }
    }
  }

  for (const record of recordsToInsert) {
    stats.inserted += 1;
    stats.bySource[record.source] += 1;
    stats.byFile[record.fileName] = (stats.byFile[record.fileName] ?? 0) + 1;
  }

  console.log('');
  console.log('Importação de BKP CSV');
  console.log(`Modo: ${options.dryRun ? 'DRY-RUN' : 'APPLY'}${options.syncUser ? ' + SYNC_USER' : ''}`);
  console.log(`Usuário: ${user.email} (${user.id})`);
  console.log(`Pasta: ${options.dataPath}`);
  console.log('');
  console.log(`Registros atuais no DB: ${stats.existingInDb}`);
  console.log(`Transações parseadas: ${stats.parsed}`);
  console.log(`Duplicadas no lote: ${stats.duplicatesInFile}`);
  console.log(`Duplicadas já no DB: ${stats.duplicatesInDb}`);
  console.log(`Prontas para inserir: ${recordsToInsert.length}`);
  console.log(`Removidas do DB: ${stats.deleted}`);
  console.log(`Inseridas: ${stats.inserted}`);
  console.log('');
  console.log('Por origem:');
  console.log(`- FIXED: ${stats.bySource.FIXED}`);
  console.log(`- MONTHLY: ${stats.bySource.MONTHLY}`);
  console.log(`- CARD: ${stats.bySource.CARD}`);
  console.log(`- INCOME: ${stats.bySource.INCOME}`);
  console.log('');
  console.log('Por arquivo:');
  Object.entries(stats.byFile)
    .sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'))
    .forEach(([fileName, count]) => {
      console.log(`- ${fileName}: ${count}`);
    });
}

main()
  .catch(async (error) => {
    console.error('Erro ao importar CSV:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
