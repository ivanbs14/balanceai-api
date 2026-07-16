/**
 * Teste de Validação: Bug de Parcelas que Atravessam Anos
 * 
 * Problema: Transações parceladas criadas no final de um ano não aparecem
 * nos meses do ano seguinte.
 * 
 * Cenário: Transação de 10/06/2026 com 12 parcelas deveria aparecer até 10/05/2027
 */

import { format, addMonths } from 'date-fns';

console.log('🧪 Teste: Parcelas que Atravessam Anos\n');
console.log('═'.repeat(60));

// Simula a data inicial da transação
const startDate = new Date(2026, 5, 10); // 10/06/2026 (mês 5 = junho)
const installments = 12;

console.log(`\n📅 Transação Original:`);
console.log(`   Data: ${format(startDate, 'yyyy-MM-dd')}`);
console.log(`   Parcelas: ${installments}x\n`);

// Função ANTIGA (com bug)
function getMonthIdFromDate_OLD(value: Date): string {
  return value.toISOString().slice(0, 7);
}

// Função NOVA (corrigida)
function getMonthIdFromDate_NEW(value: Date): string {
  return format(value, 'yyyy-MM');
}

console.log('─'.repeat(60));
console.log('| Parcela | Data Completa  | toISOString() | format()  |');
console.log('─'.repeat(60));

let bugFound = false;

for (let i = 1; i <= installments; i++) {
  const installmentDate = addMonths(startDate, i - 1);
  const oldMethod = getMonthIdFromDate_OLD(installmentDate);
  const newMethod = getMonthIdFromDate_NEW(installmentDate);
  
  const dateStr = format(installmentDate, 'yyyy-MM-dd');
  const isDifferent = oldMethod !== newMethod;
  
  if (isDifferent) {
    bugFound = true;
  }
  
  const marker = isDifferent ? '⚠️ ' : '✅ ';
  
  console.log(
    `| ${marker}${String(i).padStart(2)}/${installments} | ${dateStr} | ${oldMethod}     | ${newMethod}    |`
  );
}

console.log('─'.repeat(60));

if (bugFound) {
  console.log('\n❌ BUG DETECTADO: Métodos produziram resultados diferentes!');
  console.log('   O método toISOString() causa inconsistência de timezone.\n');
} else {
  console.log('\n✅ CORREÇÃO VALIDADA: Ambos os métodos produziram resultados consistentes!');
  console.log('   O método format() mantém timezone local correto.\n');
}

// Teste adicional: Cenário de comparação
console.log('═'.repeat(60));
console.log('\n🎯 Teste de Comparação: Parcela 8 (Janeiro/2027)\n');

const parcela8 = addMonths(startDate, 7); // 8ª parcela = 10/01/2027
const selectedMonthId = '2027-01';

console.log(`Parcela 8 Data: ${format(parcela8, 'yyyy-MM-dd HH:mm:ss')}`);
console.log(`Mês Selecionado: ${selectedMonthId}\n`);

const matchOld = getMonthIdFromDate_OLD(parcela8) === selectedMonthId;
const matchNew = getMonthIdFromDate_NEW(parcela8) === selectedMonthId;

console.log(`Método OLD (toISOString): ${getMonthIdFromDate_OLD(parcela8)} === ${selectedMonthId} → ${matchOld ? '✅ Match' : '❌ No Match'}`);
console.log(`Método NEW (format):      ${getMonthIdFromDate_NEW(parcela8)} === ${selectedMonthId} → ${matchNew ? '✅ Match' : '❌ No Match'}`);

console.log('\n═'.repeat(60));

if (matchNew && !matchOld) {
  console.log('\n🎉 CORREÇÃO BEM-SUCEDIDA!');
  console.log('   A parcela 8 agora será corretamente identificada como Janeiro/2027.\n');
} else if (matchNew && matchOld) {
  console.log('\n✅ Ambos os métodos funcionam neste ambiente.');
  console.log('   Mas format() é mais confiável em diferentes timezones.\n');
} else {
  console.log('\n⚠️  Nenhum método funcionou - verificar configuração de timezone.\n');
}

console.log('💡 Recomendação: Use sempre format() do date-fns para consistency.');
console.log('   toISOString() converte para UTC e pode causar bugs em produção.\n');
