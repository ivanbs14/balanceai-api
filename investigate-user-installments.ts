/**
 * Investigação: Transações do Usuário Específico
 * ID: 48600afc-5017-4880-c727-931b2509cafb
 */

import { PrismaClient } from '@prisma/client';
import { format, addMonths } from 'date-fns';

const prisma = new PrismaClient();
const USER_ID = '48600afc-5017-4880-c727-931b2509cafb';

async function investigateUserInstallments() {
  console.log('🔍 Investigação: Transações Parceladas do Usuário\n');
  console.log('═'.repeat(70));
  console.log(`\nUsuário ID: ${USER_ID}\n`);

  try {
    // 1. Verificar se o usuário existe
    const user = await prisma.user.findUnique({
      where: { id: USER_ID },
      select: { id: true, email: true, name: true }
    });

    if (!user) {
      console.log('❌ Usuário não encontrado no banco de dados!\n');
      return;
    }

    console.log(`✅ Usuário encontrado: ${user.name || 'N/A'} (${user.email || 'N/A'})\n`);
    console.log('─'.repeat(70));

    // 2. Buscar todas as transações parceladas do usuário
    const installmentTransactions = await prisma.transation.findMany({
      where: {
        userId: USER_ID,
        installments: {
          gt: 1
        }
      },
      orderBy: {
        Date: 'asc'
      }
    });

    console.log(`\n📊 Total de transações parceladas: ${installmentTransactions.length}\n`);

    if (installmentTransactions.length === 0) {
      console.log('⚠️  Nenhuma transação parcelada encontrada para este usuário.\n');
      console.log('   Isso explica por que não aparecem parcelas em 2027.\n');
      console.log('   O usuário precisa CRIAR uma transação parcelada primeiro.\n');
      return;
    }

    // 3. Agrupar por installmentGroupId
    const groups = new Map<string, typeof installmentTransactions>();
    
    for (const t of installmentTransactions) {
      const groupId = t.installmentGroupId || 'sem-grupo';
      if (!groups.has(groupId)) {
        groups.set(groupId, []);
      }
      groups.get(groupId)!.push(t);
    }

    console.log(`📦 Grupos de parcelamento: ${groups.size}\n`);
    console.log('─'.repeat(70));

    let has2027 = false;

    // 4. Analisar cada grupo
    for (const [groupId, transactions] of groups) {
      const first = transactions[0];
      const sortedTransactions = transactions.sort((a, b) => 
        new Date(a.Date).getTime() - new Date(b.Date).getTime()
      );
      
      console.log(`\n🎯 Grupo: ${groupId.substring(0, 12)}...`);
      console.log(`   Nome: ${first.name}`);
      console.log(`   Cartão: ${first.nameCard || 'N/A'}`);
      console.log(`   Valor unitário: R$ ${Number(first.amount).toFixed(2)}`);
      console.log(`   Parcelas esperadas: ${first.installments}`);
      console.log(`   Parcelas encontradas: ${transactions.length}\n`);

      // Verificar se faltam parcelas
      if (first.installments && transactions.length < first.installments) {
        console.log(`   ⚠️  FALTAM PARCELAS: ${first.installments - transactions.length} parcela(s) não criada(s)!\n`);
      }

      // Listar parcelas
      console.log('   Parcelas criadas:');
      
      for (const t of sortedTransactions) {
        const dateStr = format(new Date(t.Date), 'yyyy-MM-dd');
        const monthId = format(new Date(t.Date), 'yyyy-MM');
        const is2027 = new Date(t.Date).getFullYear() === 2027;
        
        if (is2027) {
          has2027 = true;
          console.log(`      ${t.installmentInfo?.padEnd(6)} - ${dateStr} (${monthId}) 🎯 ANO 2027`);
        } else {
          console.log(`      ${t.installmentInfo?.padEnd(6)} - ${dateStr} (${monthId})`);
        }
      }

      // Análise de parcelas esperadas vs criadas
      if (first.installments && transactions.length === first.installments) {
        const firstDate = new Date(sortedTransactions[0].Date);
        const expectedLastDate = addMonths(firstDate, first.installments - 1);
        const actualLastDate = new Date(sortedTransactions[sortedTransactions.length - 1].Date);
        
        console.log(`\n   📅 Primeira parcela: ${format(firstDate, 'yyyy-MM-dd')}`);
        console.log(`   📅 Última esperada: ${format(expectedLastDate, 'yyyy-MM-dd')}`);
        console.log(`   📅 Última criada: ${format(actualLastDate, 'yyyy-MM-dd')}`);
        
        if (expectedLastDate.getFullYear() === 2027 && !has2027) {
          console.log(`\n   ❌ PROBLEMA: Última parcela deveria ser em 2027, mas não foi encontrada!`);
        }
      }
    }

    // 5. Verificar parcelas em 2027
    console.log('\n' + '═'.repeat(70));
    console.log('\n📅 PARCELAS EM 2027\n');

    const parcelas2027 = installmentTransactions.filter(t => 
      new Date(t.Date).getFullYear() === 2027
    );

    if (parcelas2027.length === 0) {
      console.log('❌ Nenhuma parcela em 2027 encontrada para este usuário!\n');
      console.log('   DIAGNÓSTICO:\n');
      
      // Verificar se há grupos que DEVERIAM ter parcelas em 2027
      for (const [groupId, transactions] of groups) {
        const first = transactions[0];
        const firstDate = new Date(transactions[0].Date);
        
        if (first.installments) {
          const expectedLastMonth = addMonths(firstDate, first.installments - 1);
          
          if (expectedLastMonth.getFullYear() === 2027 && transactions.length < first.installments) {
            console.log(`   ⚠️  Grupo ${groupId.substring(0, 8)}:`);
            console.log(`      - Primeira parcela: ${format(firstDate, 'yyyy-MM-dd')}`);
            console.log(`      - Total esperado: ${first.installments}x`);
            console.log(`      - Parcelas criadas: ${transactions.length}`);
            console.log(`      - FALTAM: ${first.installments - transactions.length} parcela(s)`);
            console.log(`      - Última deveria ser em: ${format(expectedLastMonth, 'yyyy-MM')}\n`);
          }
        }
      }
      
      console.log('   POSSÍVEIS CAUSAS:');
      console.log('   1. Transações foram criadas com menos parcelas do que configurado');
      console.log('   2. Parcelas foram deletadas manualmente do banco');
      console.log('   3. Houve erro na criação das parcelas (bug anterior no backend)');
      console.log('   4. Transações foram criadas antes das parcelas serem implementadas\n');
      
      console.log('   SOLUÇÃO:');
      console.log('   - Recriar as transações parceladas OU');
      console.log('   - Completar manualmente as parcelas faltantes no banco\n');
    } else {
      console.log(`✅ ${parcelas2027.length} parcela(s) em 2027 encontradas!\n`);
      
      const mesesMap = new Map<string, number>();
      for (const p of parcelas2027) {
        const monthId = format(new Date(p.Date), 'yyyy-MM');
        mesesMap.set(monthId, (mesesMap.get(monthId) || 0) + 1);
      }
      
      console.log('   Distribuição por mês:');
      for (const [mes, count] of Array.from(mesesMap.entries()).sort()) {
        console.log(`      ${mes}: ${count} parcela(s)`);
      }
      console.log();
    }

    // 6. Estatísticas gerais do usuário
    console.log('═'.repeat(70));
    console.log('\n📈 ESTATÍSTICAS DO USUÁRIO\n');
    
    const totalTransactions = await prisma.transation.count({
      where: { userId: USER_ID }
    });
    
    console.log(`   Total de transações: ${totalTransactions}`);
    console.log(`   Transações parceladas: ${installmentTransactions.length}`);
    console.log(`   Parcelas em 2026: ${installmentTransactions.filter(t => new Date(t.Date).getFullYear() === 2026).length}`);
    console.log(`   Parcelas em 2027: ${parcelas2027.length}`);
    console.log();

  } catch (error) {
    console.error('\n❌ Erro ao consultar banco de dados:', error);
  } finally {
    await prisma.$disconnect();
  }
}

investigateUserInstallments();
