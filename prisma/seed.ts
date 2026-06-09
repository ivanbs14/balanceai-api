import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const CATEGORY_NAMES = [
  'Aluguel',
  'Assinaturas',
  'Beleza',
  'Contas',
  'Desenvolvimento',
  'Despesas eventuais',
  'Eletrônicos',
  'IFood/restaurante',
  'Lazer',
  'Mercado',
  'Necessidades',
  'Presentes',
  'Roupa',
  'Saúde',
  'Uber/transporte',
] as const;

const CARD_NAMES = ['Crédito 4', 'Inter', 'Nubank', 'Reserva', 'Santander'] as const;

async function seedCategories() {
  await prisma.category.createMany({
    data: CATEGORY_NAMES.map((name) => ({ name })),
    skipDuplicates: true,
  });
}

async function seedCards() {
  const hashedPassword = await bcrypt.hash('seed-password', 10);

  const user = await prisma.user.upsert({
    where: { email: 'seed@balance.local' },
    create: {
      name: 'Seed User',
      document: '00000000000',
      email: 'seed@balance.local',
      password: hashedPassword,
      role: 'user',
    },
    update: {},
  });

  const invoiceDate = new Date();
  invoiceDate.setDate(1);

  const invoicePayment = new Date();
  invoicePayment.setDate(10);

  for (const cardName of CARD_NAMES) {
    const existingCard = await prisma.card.findFirst({
      where: {
        userId: user.id,
        name: cardName,
      },
      select: { id: true },
    });

    if (!existingCard) {
      await prisma.card.create({
        data: {
          name: cardName,
          invoiceDate,
          invoicePayment,
          limitBalance: '0.00',
          userId: user.id,
        },
      });
    }
  }
}

async function main() {
  await seedCategories();
  await seedCards();
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error('Error while running seed:', error);
    await prisma.$disconnect();
    process.exit(1);
  });
