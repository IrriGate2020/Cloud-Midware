// Script para testar o autocadastro de sensores via MQTT
// Execute com: node test-mqtt-publish.js

const mqtt = require('mqtt');

const BROKER_URL = 'mqtt://34.58.177.51:1883';
const TOPIC = 'uplink';

// ⚠️ IMPORTANTE: Substitua pelo serial number da sua central que já existe na TagoIO
const CENTRAL_SN = '1020BA6CAB7C';

const testMessage = {
  "SN": CENTRAL_SN,
  "FWV": "V4_0_203",
  "configDevice": "true",
  "devId": CENTRAL_SN,
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
        "TEMP": "25.00",
        "HUM": "29.62"
      },
      "33": {
        "MOD": 5,
        "EN": true,
        "RG": true,
        "OBJ": "0.00",
        "LIM": "0.00",
        "TEMP": "25.20",
        "HUM": "65.40"
      },
      "34": {
        "MOD": 5,
        "EN": true,
        "RG": true,
        "TEMP": "26.30",
        "HUM": "65.50"
      },
      "35": {
        "MOD": 5,
        "EN": true,
        "RG": true,
        "TEMP": "26.30",
        "HUM": "65.60"
      }
    },
    "Time": {
      "Active": Array(32).fill(0)
    },
    "fert": {},
    "Out": {
      "ArrOutp": [0, 0, 0, 0, 0, 0, 0, 0],
      "outTime": [3, 15]
    }
  }
};

console.log('='.repeat(80));
console.log('📡 TESTE DE AUTOCADASTRO VIA MQTT');
console.log('='.repeat(80));
console.log();
console.log(`Broker: ${BROKER_URL}`);
console.log(`Tópico: ${TOPIC}`);
console.log(`Central SN: ${CENTRAL_SN}`);
console.log(`Sensores a cadastrar: ${Object.keys(testMessage.data.sens).join(', ')}`);
console.log();

const client = mqtt.connect(BROKER_URL);

client.on('connect', () => {
  console.log('✅ Conectado ao broker MQTT');
  console.log('📤 Publicando mensagem de teste...');
  console.log();
  
  client.publish(TOPIC, JSON.stringify(testMessage), (err) => {
    if (err) {
      console.error('❌ Erro ao publicar:', err);
      process.exit(1);
    } else {
      console.log('✅ Mensagem publicada com sucesso no tópico "uplink"!');
      console.log();
      console.log('📋 Próximos passos:');
      console.log('   1. Verifique os logs do clientUplink para ver o autocadastro');
      console.log('   2. Acesse https://admin.tago.io/devices');
      console.log('   3. Procure pelos sensores criados');
      console.log();
    }
    client.end();
  });
});

client.on('error', (err) => {
  console.error('❌ Erro de conexão:', err);
  process.exit(1);
});
