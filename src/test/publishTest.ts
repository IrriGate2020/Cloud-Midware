import mqtt from 'mqtt';

// Configurações do broker
const brokerUrl = 'mqtt://34.58.177.51:1883';
const clientId = 'publisher-client';

// Cria o cliente MQTT
const client = mqtt.connect(brokerUrl, { clientId });

client.on('connect', () => {
    console.log(`Cliente ${clientId} conectado ao broker.`);

    // Publica uma mensagem no tópico "uplink"
    const message = { "SN": "1020ba6cab7c", "FWV": "V4_0_203", "data": { "status": { "sboia": [1, 1], "tempInt": 40.59999847 }, "sens": { "1": { "MOD": 0, "EN": true, "RG": true, "OBJ": "35.00", "LIM": "30.00", "DMaHh": 0, "DMaMi": 1, "IMiHh": 0, "IMiMi": 1, "WTinih": 6, "WTinim": 0, "WTendh": 23, "WTendm": 59, "LTemp": 15, "LHum": 85, "AT": 0, "COMM": 0, "ERRO": 0, "TEMP": "23.45", "HUM": "0.00", "CON": "0.00", "SAL": "0.00", "TDS": "0.00", "EPS": "1.12", "PW": "0.00", "SOL": "0.00", "OUTST": 0, "ONDUR": "00:00" }, "2": { "MOD": 0, "EN": true, "RG": true, "OBJ": "35.00", "LIM": "30.00", "DMaHh": 0, "DMaMi": 1, "IMiHh": 0, "IMiMi": 1, "WTinih": 6, "WTinim": 0, "WTendh": 23, "WTendm": 59, "LTemp": 15, "LHum": 85, "AT": 0, "COMM": 0, "ERRO": 0, "TEMP": "23.15", "HUM": "0.26", "CON": "0.00", "SAL": "0.00", "TDS": "0.00", "EPS": "1.98", "PW": "0.00", "SOL": "0.00", "OUTST": 0, "ONDUR": "00:00" }, "3": { "MOD": 0, "EN": true, "RG": true, "OBJ": "35.00", "LIM": "30.00", "DMaHh": 0, "DMaMi": 1, "IMiHh": 0, "IMiMi": 1, "WTinih": 6, "WTinim": 0, "WTendh": 23, "WTendm": 59, "LTemp": 15, "LHum": 85, "AT": 0, "COMM": 0, "ERRO": 0, "TEMP": "23.68", "HUM": "0.51", "CON": "0.00", "SAL": "0.00", "TDS": "0.00", "EPS": "2.07", "PW": "0.00", "SOL": "0.00", "OUTST": 1, "ONSTR": "09:39" }, "4": { "MOD": 0, "EN": true, "RG": true, "OBJ": "35.00", "LIM": "30.00", "DMaHh": 0, "DMaMi": 1, "IMiHh": 0, "IMiMi": 1, "WTinih": 6, "WTinim": 0, "WTendh": 23, "WTendm": 59, "LTemp": 15, "LHum": 85, "AT": 0, "COMM": 0, "ERRO": 0, "TEMP": "23.56", "HUM": "0.00", "CON": "0.00", "SAL": "0.00", "TDS": "0.00", "EPS": "1.15", "PW": "0.00", "SOL": "0.00", "OUTST": 0, "ONDUR": "00:00" }, "5": { "MOD": 5, "EN": true, "RG": true, "OBJ": "25.00", "LIM": "20.00", "DMaHh": 0, "DMaMi": 3, "IMiHh": 0, "IMiMi": 1, "WTinih": 6, "WTinim": 0, "WTendh": 23, "WTendm": 59, "LTemp": 0, "LHum": 0, "AT": 0, "COMM": 0, "ERRO": 0, "TEMP": "21.70", "HUM": "69.30", "OUTST": 0, "ONDUR": "00:00" }, "33": { "MOD": 5, "EN": true, "RG": true, "OBJ": "0.00", "LIM": "0.00", "DMaHh": 0, "DMaMi": 0, "IMiHh": 0, "IMiMi": 0, "WTinih": 0, "WTinim": 0, "WTendh": 0, "WTendm": 0, "LTemp": 0, "LHum": 0, "AT": 0, "COMM": 0, "ERRO": 0, "TEMP": "21.90", "HUM": "69.30", "OUTST": 0, "ONDUR": "00:00" }, "34": { "MOD": 5, "EN": true, "RG": true, "OBJ": "0.00", "LIM": "0.00", "DMaHh": 0, "DMaMi": 0, "IMiHh": 0, "IMiMi": 0, "WTinih": 0, "WTinim": 0, "WTendh": 0, "WTendm": 0, "LTemp": 0, "LHum": 0, "AT": 0, "COMM": 0, "ERRO": 0, "TEMP": "22.20", "HUM": "68.00", "OUTST": 0, "ONDUR": "08:00" }, "35": { "MOD": 1, "EN": true, "RG": true, "OBJ": "0.00", "LIM": "0.00", "DMaHh": 0, "DMaMi": 0, "IMiHh": 0, "IMiMi": 0, "WTinih": 0, "WTinim": 0, "WTendh": 0, "WTendm": 0, "LTemp": 0, "LHum": 0, "AT": 0, "COMM": 0, "ERRO": 0, "PH": "4.60", "OUTST": 0, "ONDUR": "00:00" }, "36": { "MOD": 2, "EN": true, "RG": true, "OBJ": "0.00", "LIM": "0.00", "DMaHh": 0, "DMaMi": 0, "IMiHh": 0, "IMiMi": 0, "WTinih": 0, "WTinim": 0, "WTendh": 0, "WTendm": 0, "LTemp": 0, "LHum": 0, "AT": 0, "COMM": 0, "ERRO": 0, "NIT": "0.00", "PHO": "0.00", "POT": "0.00", "OUTST": 1, "ONSTR": "45:00" } }, "Time": { "Active": [1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], "1": { "EN": 1, "RG": 1, "sem": [1, 1, 1, 1, 1, 1, 1], "HhIni": 23, "MinIni": 40, "ArrSecDu": [10, 10, 10, 10, 10, 10], "ArrMinDu": [0, 0, 0, 0, 0, 0], "SET": [1, 2, 3, 4, 5, 6] }, "2": { "EN": 1, "RG": 1, "sem": [1, 1, 1, 1, 1, 1, 1], "HhIni": 23, "MinIni": 42, "ArrSecDu": [10, 10, 0, 0], "ArrMinDu": [0, 0, 0, 0], "SET": [1, 2, 3, 4] }, "3": { "EN": 1, "RG": 1, "sem": [0, 1, 0, 0, 0, 0, 0], "HhIni": 23, "MinIni": 44, "ArrSecDu": [10, 10, 10], "ArrMinDu": [0, 0, 0], "SET": [1, 2, 6] } }, "fert": { "A": { "EN": true, "DSec": 10, "DMin": 0 } }, "Out": { "ArrOutp": [0, 0, 1, 0, 0, 0, 0, 0], "outTime": [3, 15], "ActOutP": [0, 0, 38, 0, 1, 0, 0, 0], "ActOutT": [649, 649, 649, 649, 1, 0, 0, 0] } }, "configDevice": "true", "devId": "1CDBD4665168" };
    client.publish('uplink', JSON.stringify(message), {}, (err) => {
        if (err) {
            console.error('Erro ao publicar:', err);
        } else {
            console.log(`Mensagem publicada no tópico "uplink": ${message}`);
        }
        client.end(); // Encerra a conexão após publicar
    });
});

client.on('error', (err) => {
    console.error('Erro de conexão:', err);
});
