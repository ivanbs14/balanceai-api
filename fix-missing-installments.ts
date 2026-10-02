/**
 * Script de Correção: Completar Parcelas Faltantes
 * Cria parcelas que deveriam existir mas não foram criadas devido a bug anterior
 */

import { PrismaClient } from '@prisma/client';
import { format, addMonths } from 'date-fns';

const prisma = new PrismaClient();
const USER_ID = '48600afc-5017-4880-c727-931b2509cafb';
const DRY_RUN = false; // true = apenas simula, false = executa a correção

async function fixMissingInstallments() {
  console.log('🔧 Correção: Completar Parcelas Faltantes\n');
  console.log('═'.repeat(70));
  console.log(`\nUsuário ID: ${USER_ID}`);
  console.log(`Modo: ${DRY_RUN ? '🔍 SIMULAÇÃO (não altera banco)' : '⚠️  EXECUÇÃO (altera banco)'}\n`);
  console.log('─'.repeat(70));

  try {
    // Buscar todas as transações parceladas do usuário
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

    if (installmentTransactions.length === 0) {
      console.log('⚠️  Nenhuma transação parcelada encontrada.\n');
      return;
    }

    // Agrupar por installmentGroupId
    const groups = new Map<string, typeof installmentTransactions>();
    
    for (const t of installmentTransactions) {
      const groupId = t.installmentGroupId || 'sem-grupo';
      if (!groups.has(groupId)) {
        groups.set(groupId, []);
      }
      groups.get(groupId)!.push(t);
    }

    console.log(`\n📦 Analisando ${groups.size} grupo(s) de parcelamento...\n`);

    let totalMissing = 0;
    let totalCreated = 0;
    const groupsToFix: Array<{
      groupId: string;
      transactions: typeof installmentTransactions;
      missing: number;
      expected: number;
    }> = [];

    // Identificar grupos com parcelas faltantes
    for (const [groupId, transactions] of groups) {
      const first = transactions[0];
      const expectedInstallments = first.installments || 0;
      const actualInstallments = transactions.length;

      if (actualInstallments < expectedInstallments) {
        const missing = expectedInstallments - actualInstallments;
        totalMissing += missing;
        
        groupsToFix.push({
          groupId,
          transactions,
          missing,
          expected: expectedInstallments
        });

        console.log(`⚠️  Grupo ${groupId.substring(0, 12)}...`);
        console.log(`   Nome: ${first.name}`);
        console.log(`   Esperado: ${expectedInstallments}x | Encontrado: ${actualInstallments}x`);
        console.log(`   FALTAM: ${missing} parcela(s)\n`);
      }
    }

    if (groupsToFix.length === 0) {
      console.log('✅ Todos os grupos estão completos! Nada a corrigir.\n');
      return;
    }

    console.log('─'.repeat(70));
    console.log(`\n📊 Resumo: ${groupsToFix.length} grupo(s) precisam de correção`);
    console.log(`   Total de parcelas faltantes: ${totalMissing}\n`);
    console.log('─'.repeat(70));

    // Corrigir cada grupo
    for (const group of groupsToFix) {
      console.log(`\n🔧 Corrigindo grupo: ${group.groupId.substring(0, 12)}...`);
      
      const sortedTransactions = group.transactions.sort((a, b) => 
        new Date(a.Date).getTime() - new Date(b.Date).getTime()
      );
      
      const first = sortedTransactions[0];
      const firstDate = new Date(first.Date);
      const currentCount = sortedTransactions.length;
      
      console.log(`   Primeira parcela: ${format(firstDate, 'yyyy-MM-dd')}`);
      console.log(`   Última criada: ${format(new Date(sortedTransactions[currentCount - 1].Date), 'yyyy-MM-dd')}`);
      
      // Criar parcelas faltantes
      const installmentsToCreate = [];
      
      for (let i = currentCount + 1; i <= group.expected; i++) {
        const installmentDate = addMonths(firstDate, i - 1);
        const monthId = format(installmentDate, 'yyyy-MM');
        const is2027 = installmentDate.getFullYear() === 2027;
        
        console.log(`   Criando ${i}/${group.expected}: ${format(installmentDate, 'yyyy-MM-dd')} (${monthId}) ${is2027 ? '🎯 2027' : ''}`);
        
        const installmentData = {
          userId: first.userId,
          name: first.name,
          type: first.type,
          amount: first.amount,
          category: first.category,
          paymentMethod: first.paymentMethod,
          paymentStatus: first.paymentStatus,
          isFixed: first.isFixed,
          installments: first.installments,
          installmentInfo: `${i}/${first.installments}`,
          installmentGroupId: first.installmentGroupId,
          nameCard: first.nameCard,
          cardId: first.cardId,
          Date: installmentDate,
          withdrawal: first.withdrawal,
        };
        
        installmentsToCreate.push(installmentData);
      }
      
      // Executar criação se não for DRY_RUN
      if (!DRY_RUN) {
        for (const data of installmentsToCreate) {
          await prisma.transation.create({ data });
          totalCreated++;
        }
        console.log(`   ✅ ${installmentsToCreate.length} parcela(s) criada(s)\n`);
      } else {
        console.log(`   🔍 SIMULAÇÃO: ${installmentsToCreate.length} parcela(s) seriam criadas\n`);
      }
    }

    console.log('═'.repeat(70));
    console.log(`\n📈 RESULTADO FINAL\n`);
    console.log(`   Grupos corrigidos: ${groupsToFix.length}`);
    console.log(`   Parcelas ${DRY_RUN ? 'que seriam criadas' : 'criadas'}: ${DRY_RUN ? totalMissing : totalCreated}`);
    
    if (DRY_RUN) {
      console.log(`\n⚠️  ATENÇÃO: Modo SIMULAÇÃO ativo!`);
      console.log(`   Nenhuma alteração foi feita no banco de dados.`);
      console.log(`   Para executar a correção, altere DRY_RUN = false no script.\n`);
    } else {
      console.log(`\n✅ Correção concluída com sucesso!`);
      console.log(`   As parcelas agora serão exibidas corretamente em 2027.\n`);
      
      // Verificar resultado
      const parcelas2027 = await prisma.transation.count({
        where: {
          userId: USER_ID,
          installments: { gt: 1 },
          Date: {
            gte: new Date('2027-01-01'),
            lt: new Date('2028-01-01')
          }
        }
      });
      
      console.log(`   Parcelas em 2027 agora: ${parcelas2027}\n`);
    }

  } catch (error) {
    console.error('\n❌ Erro ao processar:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixMissingInstallments();
