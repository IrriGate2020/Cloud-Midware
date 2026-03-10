import { timerDuration } from "../analysis/timerDuration";

// ========================================
// CONFIGURE SEU TOKEN AQUI
// ========================================
const TAGO_TOKEN = "SEU_TOKEN_AQUI";

// ========================================
// CONFIGURE O DEVICE ID E VARIÁVEL AQUI
// ========================================
const DEVICE_ID = "SEU_DEVICE_ID_AQUI";
const VARIABLE_NAME = "data"; // Nome da variável que tem o metadata EN

// ========================================
// SIMULAR CONTEXTO DO TAGOIO
// ========================================
const context = {
  token: TAGO_TOKEN,
  log: (message: string) => {
    console.log(`[Context Log] ${message}`);
  },
};

// ========================================
// TESTAR COM EN = 1 (ATIVAR TIMER)
// ========================================
async function testActivation() {
  console.log("\n=== TESTE: ATIVAÇÃO DO TIMER (EN=1) ===\n");
  
  const scope = [
    {
      variable: VARIABLE_NAME,
      value: 100, // Qualquer valor
      device: DEVICE_ID,
      time: new Date().toISOString(),
      metadata: {
        EN: 1, // Timer ativado
      },
    },
  ];

  await timerDuration(context, scope);
}

// ========================================
// TESTAR COM EN = 0 (DESATIVAR TIMER)
// ========================================
async function testDeactivation() {
  console.log("\n=== TESTE: DESATIVAÇÃO DO TIMER (EN=0) ===\n");
  
  const scope = [
    {
      variable: VARIABLE_NAME,
      value: 100, // Qualquer valor
      device: DEVICE_ID,
      time: new Date().toISOString(),
      metadata: {
        EN: 0, // Timer desativado
      },
    },
  ];

  await timerDuration(context, scope);
}

// ========================================
// EXECUTAR OS TESTES
// ========================================
async function runTests() {
  console.log("========================================");
  console.log("TESTE LOCAL - TIMER DURATION ANALYSIS");
  console.log("========================================");
  console.log(`Token: ${TAGO_TOKEN.substring(0, 20)}...`);
  console.log(`Device: ${DEVICE_ID}`);
  console.log(`Variable: ${VARIABLE_NAME}`);
  console.log("========================================\n");
  console.log("FORMATOS ESPERADOS:");
  console.log("  timer_start value: DD/MM/YYYY HH:MM:SS");
  console.log("  timer_duration value: HH:MM:SS");
  console.log("========================================\n");

  // Escolha qual teste rodar:
  
  // TESTE 1: Ativar timer (vai salvar timer_start)
  await testActivation();
  
  // TESTE 2: Desativar timer (vai calcular duração)
  // Descomente a linha abaixo para testar desativação
  // await testDeactivation();
}

// Executar
runTests().catch((error) => {
  console.error("Erro ao executar teste:", error);
  process.exit(1);
});
