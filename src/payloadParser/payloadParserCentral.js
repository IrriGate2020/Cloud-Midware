function toTagoFormat(value) {
  const jsonObj = JSON.parse(value);
  const data = [
    {
      variable: "data",
      value: "Values are on metadata",
      metadata: {},
    },
  ];

  const fields = [
    "MOD",
    "RG",
    "OBJ",
    "LIM",
    "DMaHh",
    "DMaMi",
    "IMiHh",
    "IMiMi",
    "AT",
    "COMM",
    "LUX",
    "Ph",
    "NIT",
    "PHO",
    "HUM",
    "TEMP",
    "CON",
    "SAL",
    "TDS",
    "EPS",
    "PW",
    "SOL",
    "EPS",
    "POT",
  ];
  const errorDefinitions = {
    ES000: ["Sensor OK", "ok", "OK. Nenhum problema com o sensor."],
    ES001: ["Erro de CRC", "warning", "O CRC recebido pelo sensor veio errado. Pode indicar ruido eletromagnetico presente no local ou degradacao no cabo de comunicacao. Nao e critico."],
    ES002: ["Leitura fora dos limites", "critical", "Leitura fora dos limites esperados. Normalmente indica sensor chegando ao fim da vida util; em alguns casos pode ser remediado com calibracao."],
    ES003: ["Sensor sem resposta", "critical", "Nenhuma resposta recebida. O sensor pode estar queimado ou conectado incorretamente, exigindo revisao das conexoes."],
    ES004: ["Mudanca brusca na leitura", "diagnostic", "Mudanca brusca acima de 15% na leitura do sensor. Pode indicar remocao do sensor do local ou acionamento de automacao."],
    ES005: ["Leitura acima do setpoint high", "warning", "Leitura do sensor muito acima do setpoint high da automacao associada. Pode indicar falha em automacoes como sombreamento e climatizacao."],
    ES006: ["Leitura abaixo do setpoint low", "warning", "Leitura do sensor muito abaixo do setpoint low da automacao associada. Pode indicar falha em automacoes como aquecimento e irrigacao."],
    EA000: ["Automacao OK", "ok", "OK. Nenhum problema com a automacao."],
    EA001: ["Sem estimulo", "warning", "A variavel de controle nao sofreu variacao significativa ao ativar a automacao."],
  };

  const addErrorFields = () => {
    if (!jsonObj.hasOwnProperty("ERRO")) return;

    const rawErrors = typeof jsonObj.ERRO === "string" ? JSON.parse(jsonObj.ERRO) : jsonObj.ERRO;
    if (!rawErrors || typeof rawErrors !== "object" || Array.isArray(rawErrors)) return;

    const activeErrors = [];
    data[0].metadata.ERRO = rawErrors;

    Object.entries(errorDefinitions).forEach(([code, definition]) => {
      const value = Number(rawErrors[code] || 0);
      const [label, severity, description] = definition;

      data[0].metadata[code] = value;

      if (value > 0) {
        activeErrors.push({ code, value, label, severity, description });
      }

      data.push({
        variable: code,
        value,
        metadata: {
          code,
          label,
          description,
          type: code.startsWith("EA") ? "automation" : "sensor",
          severity,
          active: value > 0,
        },
      });
    });

    data[0].metadata.erro_ativo = activeErrors.length > 0;
    data[0].metadata.erro_quantidade = activeErrors.length;
    data[0].metadata.erro_codigos = activeErrors.map((error) => error.code).join(", ");
    data[0].metadata.erro_descricao = activeErrors.map((error) => error.code + ": " + error.label).join(" | ");
  };

  fields.forEach((field) => {
    if (jsonObj.hasOwnProperty(field)) {
      data[0].metadata[field] = jsonObj[field];
    }
    if (
      ["OBJ", "LIM", "DMaMi", "IMiMi"].includes(field) &&
      jsonObj.hasOwnProperty(field)
    ) {
      data.push({
        variable: field,
        value: jsonObj[field],
      });
    }
  });

  // Função para adicionar 0 à esquerda se necessário
  const formatWithLeadingZero = (num) => (num < 10 ? `0${num}` : `${num}`);

  // Tratamento do campo "EN"
  if (jsonObj.hasOwnProperty("EN")) {
    data.push({
      variable: "enable",
      value: jsonObj.EN === 1 ? "Sim" : "Não",
    });
  }

  // Tratamento do array "sem"
  if (jsonObj.hasOwnProperty("sem")) {
    const diasSemana = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"];

    jsonObj.sem.forEach((valor, index) => {
      if (diasSemana[index]) {
        data.push({
          variable: diasSemana[index],
          value: valor === 1,
        });
      }
    });
  }

  // Tratamento de "HhIni" e "MinIni" para formar "init_time"
  if (jsonObj.hasOwnProperty("HhIni") && jsonObj.hasOwnProperty("MinIni")) {
    data.push({
      variable: "init_time",
      value: `${formatWithLeadingZero(jsonObj.HhIni)}:${formatWithLeadingZero(
        jsonObj.MinIni
      )}`,
    });
  }
  // Tratamento dos arrays "ArrMinDu" e "ArrSecDu"
  if (
    jsonObj.hasOwnProperty("ArrMinDu") &&
    jsonObj.hasOwnProperty("ArrSecDu") 
  ) {
    const minArr = jsonObj.ArrMinDu;
    const secArr = jsonObj.ArrSecDu;
    const set = jsonObj.SET;

    // Garante que os arrays tenham o mesmo tamanho e que o menor define o número de pares
    const length = Math.min(minArr.length, secArr.length);

    for (let i = 0; i < length; i++) {
      data.push({
        variable: `duration_${set[i]}`,
        value: `${formatWithLeadingZero(minArr[i])}:${formatWithLeadingZero(
          secArr[i]
        )}`,
      });
      data.push({
        variable: `set${set[i]}`,
        value: "OK"
      })
    }
  }
  addErrorFields();
  return data;
}

// let payload = [
//   {
//     value:
//       '{"EN":1,"RG":1,"sem":[1,0,1,0,1,0,1],"HhIni":7,"MinIni":5,"ArrSecDu":[0,1,2,3],"ArrMinDu":[7,8,10,8],"SET":[9,10,11,12]}',
//     variable: "payload",
//   },
// ];

function parserTagoIo(payload) {
  const payload_raw = payload.find(
    (x) =>
      x.variable === "payload_raw" ||
      x.variable === "payload" ||
      x.variable === "data"
  );

  if (payload_raw) {
    const data = toTagoFormat(payload_raw.value);
    console.log(data);
    try {
      payload = payload.concat(
        data.map((x) => ({
          ...x,
        }))
      );
      return payload;
    } catch (e) {
      // Print the error to the Live Inspector.
      console.error(e);

      // Return the variable parse_error for debugging.
      payload = [{ variable: "parse_error", value: e.message }];
    }
  }
  console.log(payload);
}

//parserTagoIo(payload);

exports.parserTagoIo = parserTagoIo;
