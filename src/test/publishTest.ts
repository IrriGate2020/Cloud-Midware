import mqtt from 'mqtt';

// Configurações do broker
const brokerUrl = 'mqtt://34.67.184.199:1883';
const clientId = 'publisher-client';

// Cria o cliente MQTT
const client = mqtt.connect(brokerUrl, { clientId });

client.on('connect', () => {
    console.log(`Cliente ${clientId} conectado ao broker.`);

    // Publica uma mensagem no tópico "uplink"
    const message = {
        "SN": "d8132a07659c",
        "FWV": "V4_0_167",
        "data": {
            "status": {
                "sboia": true
            },
            "sens": {
                "33": {
                    "MOD": 5,
                    "EN": true,
                    "RG": true,
                    "OBJ": "2.00",
                    "LIM": "1.10",
                    "DMaHh": 0,
                    "DMaMi": 2,
                    "IMiHh": 0,
                    "IMiMi": 3,
                    "AT": 0,
                    "COMM": 0,
                    "TEMP": "26.40",
                    "HUM": "68.10",
                    "NIT": 0,
                    "POT": 0,
                    "PHO": 1,
                }
            },
            "Time": {
                "6": {
                    "EN": 1,
                    "RG": 1,
                    "sem": [
                        1,
                        0,
                        1,
                        0,
                        1,
                        0,
                        1
                    ],
                    "HhIni": 2,
                    "MinIni": 30,
                    ArrSecDu : [0, 4, 5],
                    ArrMinDu: [0, 4, 5],
                    SET: [1, 4, 5] 
                }
            },
            "fert": {
                "A": {
                    "EN": true,
                    "DSec": 8,
                    "DMin": 0
                }
            },
            "Out": {
                "ArrOutp": [
                    1,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                ],
                "outTime": [
                    3,
                    15
                ]
            }
        }
    };
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
