/**
 * Análise: Verificar se há transações que DEVERIAM ter parcelas em 2027
 */

import { PrismaClient } from '@prisma/client';
import { format, addMonths } from 'date-fns';

const prisma = new PrismaClient();
const USER_ID = '48600afc-5017-4880-c727-931b2509cafb';

async function analyzeTransactionsThatShouldReach2027() {
  console.log('🔍 Análise: Transações que DEVERIAM ter parcelas em 2027\n');
  console.log('═'.repeat(70));

  try {
    const installmentTransactions = await prisma.transation.findMany({
      where: {
        userId: USER_ID,
        installments: { gt: 1 }
      },
      orderBy: { Date: 'asc' }
    });

    // Agrupar por installmentGroupId
    const groups = new Map<string, typeof installmentTransactions>();
    
    for (const t of installmentTransactions) {
      const groupId = t.installmentGroupId || 'sem-grupo';
      if (!groups.has(groupId)) {
        groups.set(groupId, []);
      }
      groups.get(groupId)!.push(t);
    }

    console.log(`\n📦 Analisando ${groups.size} grupo(s)...\n`);

    let groupsThatShouldReach2027 = 0;

    for (const [groupId, transactions] of groups) {
      const sorted = transactions.sort((a, b) => 
        new Date(a.Date).getTime() - new Date(b.Date).getTime()
      );
      
      const first = sorted[0];
      const firstDate = new Date(first.Date);
      const expectedInstallments = first.installments || 0;
      
      // Calcular quando a ÚLTIMA parcela deveria ser
      const lastExpectedDate = addMonths(firstDate, expectedInstallments - 1);
      const shouldReach2027 = lastExpectedDate.getFullYear() === 2027;
      
      if (shouldReach2027) {
        groupsThatShouldReach2027++;
        
        console.log(`🎯 Grupo: ${groupId.substring(0, 12)}...`);
        console.log(`   Nome: ${first.name}`);
        console.log(`   Cartão: ${first.nameCard || 'N/A'}`);
        console.log(`   Total parcelas: ${expectedInstallments}x`);
        console.log(`   Primeira parcela: ${format(firstDate, 'yyyy-MM-dd')}`);
        console.log(`   Última deveria ser: ${format(lastExpectedDate, 'yyyy-MM-dd')} 🎯`);
        console.log(`   Última criada: ${format(new Date(sorted[sorted.length - 1].Date), 'yyyy-MM-dd')}`);
        
        const actualLastDate = new Date(sorted[sorted.length - 1].Date);
        const actualReaches2027 = actualLastDate.getFullYear() === 2027;
        
        if (actualReaches2027) {
          console.log(`   ✅ Parcelas criadas corretamente até 2027\n`);
        } else {
          console.log(`   ❌ Parcelas NÃO chegam em 2027 (terminam em ${actualLastDate.getFullYear()})\n`);
        }
      }
    }

    console.log('─'.repeat(70));
    
    if (groupsThatShouldReach2027 === 0) {
      console.log('\n📊 RESULTADO:\n');
      console.log('   ✅ Nenhuma transação deveria ter parcelas em 2027.');
      console.log('   ✅ Todas as transações parceladas terminam em 2026.');
      console.log('\n💡 CONCLUSÃO:\n');
      console.log('   O comportamento está CORRETO!');
      console.log('   Este usuário simplesmente não tem transações que atravessam 2027.');
      console.log('\n   Para testar a correção do bug, o usuário deve:');
      console.log('   1. Criar uma NOVA transação parcelada');
      console.log('   2. Com data recente (ex: junho ou julho/2026)');
      console.log('   3. Com 12 ou mais parcelas');
      console.log('   4. Isso gerará parcelas em 2027 que serão exibidas corretamente\n');
    } else {
      console.log(`\n📊 RESULTADO:\n`);
      console.log(`   ${groupsThatShouldReach2027} transação(ões) deveriam ter parcelas em 2027.\n`);
    }

  } catch (error) {
    console.error('\n❌ Erro:', error);
  } finally {
    await prisma.$disconnect();
  }
}

analyzeTransactionsThatShouldReach2027();
