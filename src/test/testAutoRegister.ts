// Script de teste para o autocadastro de sensores
// Execute com: ts-node src/test/testAutoRegister.ts

import { autoRegisterSensors } from '../function/autoRegisterSensors';

// ⚠️ IMPORTANTE: Forneça o Connector ID e Network ID aqui
// Esses IDs podem ser obtidos em https://admin.tago.io/connectors
const CONNECTOR_ID = process.env.TAGO_CONNECTOR_ID || ''; // Forneça seu Connector ID
const NETWORK_ID = process.env.TAGO_NETWORK_ID || ''; // Forneça seu Network ID (geralmente o mesmo)

// Mensagem de exemplo igual à que o IrrigaPlay envia
const mockUplinkMessage = {
  "SN": "TEST_1020BA6CAB7C",
  "FWV": "V4_0_203",
  "data": {
    "status": {
      "sboia": true
    },
    "sens": {
      "1": {
        "MOD": 0,
        "EN": true,
        "RG": true,
        "OBJ": "25.00",
        "LIM": "28.00",
        "DMaHh": 0,
        "DMaMi": 1,
        "IMiHh": 0,
        "IMiMi": 1,
        "WTinih": 0,
        "WTinim": 0,
        "WTendh": 0,
        "WTendm": 0,
        "LTemp": 0,
        "LHum": 0,
        "AT": 0,
        "COMM": 0,
        "ERRO": 0,
        "TEMP": "25.00",
        "HUM": "29.11",
        "CON": "1.00",
        "SAL": "500.00",
        "TDS": "500.00",
        "EPS": "80.00",
        "PW": "1.01",
        "SOL": "0.91"
      },
      "2": {
        "MOD": 0,
        "EN": true,
        "RG": true,
        "OBJ": "0.00",
        "LIM": "0.00",
        "DMaHh": 0,
        "DMaMi": 0,
        "IMiHh": 0,
        "IMiMi": 0,
        "WTinih": 0,
        "WTinim": 0,
        "WTendh": 0,
        "WTendm": 0,
        "LTemp": 0,
        "LHum": 0,
        "AT": 0,
        "COMM": 0,
        "ERRO": 0,
        "TEMP": "25.00",
        "HUM": "29.33",
        "CON": "1.00",
        "SAL": "500.00",
        "TDS": "500.00",
        "EPS": "80.00",
        "PW": "1.01",
        "SOL": "0.92"
      },
      "3": {
        "MOD": 0,
        "EN": true,
        "RG": true,
        "OBJ": "0.00",
        "LIM": "0.00",
        "DMaHh": 0,
        "DMaMi": 0,
        "IMiHh": 0,
        "IMiMi": 0,
        "WTinih": 0,
        "WTinim": 0,
        "WTendh": 0,
        "WTendm": 0,
        "LTemp": 0,
        "LHum": 0,
        "AT": 0,
        "COMM": 0,
        "ERRO": 0,
        "TEMP": "25.00",
        "HUM": "29.62",
        "CON": "1.00",
        "SAL": "500.00",
        "TDS": "500.00",
        "EPS": "80.00",
        "PW": "1.01",
        "SOL": "0.93"
      },
      "33": {
        "MOD": 5,
        "EN": true,
        "RG": true,
        "OBJ": "0.00",
        "LIM": "0.00",
        "DMaHh": 0,
        "DMaMi": 0,
        "IMiHh": 0,
        "IMiMi": 0,
        "WTinih": 0,
        "WTinim": 0,
        "WTendh": 0,
        "WTendm": 0,
        "LTemp": 0,
        "LHum": 0,
        "AT": 0,
        "COMM": 0,
        "ERRO": 0,
        "TEMP": "25.20",
        "HUM": "65.40"
      },
      "34": {
        "MOD": 5,
        "EN": true,
        "RG": true,
        "OBJ": "0.00",
        "LIM": "0.00",
        "DMaHh": 0,
        "DMaMi": 0,
        "IMiHh": 0,
        "IMiMi": 0,
        "WTinih": 0,
        "WTinim": 0,
        "WTendh": 0,
        "WTendm": 0,
        "LTemp": 0,
        "LHum": 0,
        "AT": 0,
        "COMM": 0,
        "ERRO": 0,
        "TEMP": "26.30",
        "HUM": "65.50"
      },
      "35": {
        "MOD": 5,
        "EN": true,
        "RG": true,
        "OBJ": "0.00",
        "LIM": "0.00",
        "DMaHh": 0,
        "DMaMi": 0,
        "IMiHh": 0,
        "IMiMi": 0,
        "WTinih": 0,
        "WTinim": 0,
        "WTendh": 0,
        "WTendm": 0,
        "LTemp": 0,
        "LHum": 0,
        "AT": 0,
        "COMM": 0,
        "ERRO": 0,
        "TEMP": "26.30",
        "HUM": "65.60"
      }
    },
    "Time": {
      "Active": [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    },
    "fert": {},
    "Out": {
      "ArrOutp": [0, 0, 0, 0, 0, 0, 0, 0],
      "outTime": [3, 15]
    }
  },
  "configDevice": "true",
  "devId": "TEST_1020BA6CAB7C"
};

async function runTest() {
  console.log('='.repeat(80));
  console.log('🧪 TESTE DE AUTOCADASTRO DE SENSORES');
  console.log('='.repeat(80));
  console.log();

  // Verifica se as variáveis de ambiente estão configuradas
  if (!process.env.TAGO_ACCOUNT_TOKEN) {
    console.error('❌ ERRO: Variável de ambiente TAGO_ACCOUNT_TOKEN não configurada');
    console.log('   Configure em .env ou execute:');
    console.log('   export TAGO_ACCOUNT_TOKEN=seu-token-aqui');
    process.exit(1);
  }

  console.log('✅ Token da conta TagoIO configurado');
  console.log();

  console.log('📋 Dados da mensagem de teste:');
  console.log(`   Central: ${mockUplinkMessage.SN}`);
  console.log(`   Firmware: ${mockUplinkMessage.FWV}`);
  console.log(`   ConfigDevice: ${mockUplinkMessage.configDevice}`);
  console.log(`   Sensores: ${Object.keys(mockUplinkMessage.data.sens).join(', ')}`);
  console.log();

  console.log('🚀 Iniciando teste de autocadastro...');
  console.log();

  try {
    await autoRegisterSensors(mockUplinkMessage, CONNECTOR_ID, NETWORK_ID);
    
    console.log();
    console.log('='.repeat(80));
    console.log('✅ TESTE CONCLUÍDO COM SUCESSO!');
    console.log('='.repeat(80));
    console.log();
    console.log('📝 Próximos passos:');
    console.log('   1. Acesse https://admin.tago.io/devices');
    console.log('   2. Procure pelos dispositivos criados');
    console.log('   3. Verifique as tags e configurações');
    console.log();

  } catch (error) {
    console.log();
    console.log('='.repeat(80));
    console.log('❌ TESTE FALHOU');
    console.log('='.repeat(80));
    console.error();
    console.error('Erro:', error);
    console.log();
    process.exit(1);
  }
}

// Executa o teste
runTest();
