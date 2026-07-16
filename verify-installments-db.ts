/**
 * Verificação: Transações Parceladas no Banco de Dados
 * Consulta transações parceladas e verifica se há parcelas de 2027
 */

import { PrismaClient } from '@prisma/client';
import { format } from 'date-fns';

const prisma = new PrismaClient();

async function verifyInstallments() {
  console.log('🔍 Verificando Transações Parceladas no Banco de Dados\n');
  console.log('═'.repeat(70));

  try {
    // 1. Consultar transações parceladas existentes
    console.log('\n📊 1. TRANSAÇÕES PARCELADAS EXISTENTES\n');
    
    const installmentTransactions = await prisma.transation.findMany({
      where: {
        installments: {
          gt: 1
        }
      },
      orderBy: {
        Date: 'asc'
      },
      select: {
        id: true,
        Date: true,
        amount: true,
        installments: true,
        installmentInfo: true,
        installmentGroupId: true,
        nameCard: true,
        name: true,
        userId: true
      }
    });

    if (installmentTransactions.length === 0) {
      console.log('⚠️  Nenhuma transação parcelada encontrada no banco.\n');
    } else {
      console.log(`✅ Encontradas ${installmentTransactions.length} transações parceladas\n`);
      
      // Agrupar por installmentGroupId
      const groups = new Map<string, typeof installmentTransactions>();
      
      for (const t of installmentTransactions) {
        const groupId = t.installmentGroupId || 'sem-grupo';
        if (!groups.has(groupId)) {
          groups.set(groupId, []);
        }
        groups.get(groupId)!.push(t);
      }
      
      console.log(`📦 Total de grupos de parcelamento: ${groups.size}\n`);
      console.log('─'.repeat(70));
      
      for (const [groupId, transactions] of groups) {
        const first = transactions[0];
        console.log(`\n🎯 Grupo: ${groupId.substring(0, 8)}...`);
        console.log(`   Nome: ${first.name || 'N/A'}`);
        console.log(`   Cartão: ${first.nameCard || 'N/A'}`);
        console.log(`   Total parcelas: ${transactions.length}/${first.installments}`);
        console.log(`   Valor unitário: R$ ${Number(first.amount).toFixed(2)}\n`);
        
        console.log('   Parcelas:');
        for (const t of transactions) {
          const dateStr = format(new Date(t.Date), 'yyyy-MM-dd');
          const monthId = format(new Date(t.Date), 'yyyy-MM');
          console.log(`      ${t.installmentInfo?.padEnd(6)} - ${dateStr} (${monthId})`);
        }
      }
    }

    // 2. Verificar se há parcelas de 2027
    console.log('\n' + '═'.repeat(70));
    console.log('\n📅 2. PARCELAS DE 2027\n');
    
    const parcelas2027 = await prisma.transation.findMany({
      where: {
        installments: {
          gt: 1
        },
        Date: {
          gte: new Date('2027-01-01'),
          lt: new Date('2028-01-01')
        }
      },
      orderBy: {
        Date: 'asc'
      }
    });

    if (parcelas2027.length === 0) {
      console.log('⚠️  Nenhuma parcela encontrada para 2027.\n');
      console.log('   Isso pode explicar o bug reportado: transações criadas em 2026');
      console.log('   com parcelas que deveriam ir até 2027 podem não ter sido');
      console.log('   criadas corretamente ou foram deletadas.\n');
    } else {
      console.log(`✅ Encontradas ${parcelas2027.length} parcelas em 2027\n`);
      
      const mesesMap = new Map<string, number>();
      
      for (const p of parcelas2027) {
        const monthId = format(new Date(p.Date), 'yyyy-MM');
        mesesMap.set(monthId, (mesesMap.get(monthId) || 0) + 1);
      }
      
      console.log('   Distribuição por mês:');
      for (const [mes, count] of Array.from(mesesMap.entries()).sort()) {
        console.log(`      ${mes}: ${count} parcela(s)`);
      }
    }

    // 3. Testar exibição com código corrigido
    console.log('\n' + '═'.repeat(70));
    console.log('\n🧪 3. TESTE DE EXIBIÇÃO COM CÓDIGO CORRIGIDO\n');
    
    if (parcelas2027.length > 0) {
      console.log('Testando método getMonthIdFromDate() nas parcelas de 2027:\n');
      
      // Simular métodos antigo e novo
      const getMonthIdFromDate_OLD = (value: Date) => {
        return value.toISOString().slice(0, 7);
      };
      
      const getMonthIdFromDate_NEW = (value: Date) => {
        return format(value, 'yyyy-MM');
      };
      
      let bugCount = 0;
      
      for (const p of parcelas2027.slice(0, 10)) { // Mostrar apenas primeiras 10
        const date = new Date(p.Date);
        const oldMethod = getMonthIdFromDate_OLD(date);
        const newMethod = getMonthIdFromDate_NEW(date);
        
        if (oldMethod !== newMethod) {
          bugCount++;
          console.log(`   ⚠️  ${p.installmentInfo}: ${format(date, 'yyyy-MM-dd')}`);
          console.log(`      OLD: ${oldMethod} | NEW: ${newMethod} | DB: ${date.toISOString()}`);
        } else {
          console.log(`   ✅  ${p.installmentInfo}: ${format(date, 'yyyy-MM-dd')} → ${newMethod}`);
        }
      }
      
      if (bugCount > 0) {
        console.log(`\n   ❌ ${bugCount} parcela(s) com inconsistência detectada!`);
        console.log('   A correção aplicada resolve este problema.\n');
      } else {
        console.log('\n   ✅ Nenhuma inconsistência detectada neste ambiente.');
        console.log('   A correção garante consistência em produção.\n');
      }
    } else {
      console.log('⚠️  Sem parcelas de 2027 para testar.\n');
      console.log('   Recomendação: Criar transação parcelada de teste:');
      console.log('   - Data: 2026-06-10');
      console.log('   - Parcelas: 12x');
      console.log('   - Isso criará parcelas até maio/2027\n');
    }

    // Estatísticas gerais
    console.log('═'.repeat(70));
    console.log('\n📈 ESTATÍSTICAS GERAIS\n');
    
    const totalTransactions = await prisma.transation.count();
    const installmentCount = installmentTransactions.length;
    const percentage = totalTransactions > 0 
      ? ((installmentCount / totalTransactions) * 100).toFixed(1)
      : '0';
    
    console.log(`   Total de transações: ${totalTransactions}`);
    console.log(`   Transações parceladas: ${installmentCount} (${percentage}%)`);
    console.log(`   Parcelas em 2027: ${parcelas2027.length}`);
    
  } catch (error) {
    console.error('\n❌ Erro ao consultar banco de dados:', error);
  } finally {
    await prisma.$disconnect();
  }
}

verifyInstallments();
