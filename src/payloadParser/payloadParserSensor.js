function toTagoFormat(value) {
  const jsonObj = typeof value === "string" ? JSON.parse(value) : value;
  const data = [
    {
      variable: "data",
      value: "Values are on metadata",
      metadata: {},
    },
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

  const parsePossibleJson = (raw) => {
    if (raw === undefined || raw === null || raw === "") return null;
    if (typeof raw === "string") {
      try {
        return JSON.parse(raw);
      } catch (_) {
        return null;
      }
    }
    return raw;
  };

  const addErrorSource = (sources, rawErrors, sourceMetadata = {}) => {
    const parsedErrors = parsePossibleJson(rawErrors);
    if (!parsedErrors || typeof parsedErrors !== "object" || Array.isArray(parsedErrors)) return;
    sources.push({ errors: parsedErrors, metadata: sourceMetadata });
  };

  const getErrorSources = () => {
    const sources = [];

    addErrorSource(sources, jsonObj.ERRO, { source: "root" });
    addErrorSource(sources, jsonObj.data && jsonObj.data.ERRO, { source: "data" });

    const sensFromRoot = jsonObj.sens && typeof jsonObj.sens === "object" ? jsonObj.sens : null;
    const sensFromData = jsonObj.data && jsonObj.data.sens && typeof jsonObj.data.sens === "object" ? jsonObj.data.sens : null;
    const sens = sensFromRoot || sensFromData;

    if (sens) {
      Object.entries(sens).forEach(([sensorNumber, sensorPayload]) => {
        if (!sensorPayload || typeof sensorPayload !== "object") return;
        addErrorSource(sources, sensorPayload.ERRO, {
          source: "sens",
          sensor_number: sensorNumber,
          sensor_serial: sensorPayload.SN || sensorPayload.devId || sensorPayload.serial_number,
          sensor_mod: sensorPayload.MOD,
        });
      });
    }

    return sources;
  };

  const addErrorFields = () => {
    const errorSources = getErrorSources();
    if (!errorSources.length) return;

    const activeErrors = [];
    const aggregatedErrors = {};
    const sourceSummary = [];

    Object.keys(errorDefinitions).forEach((code) => {
      aggregatedErrors[code] = 0;
    });

    errorSources.forEach((source, sourceIndex) => {
      const activeCodesForSource = [];

      Object.entries(errorDefinitions).forEach(([code, definition]) => {
        const rawValue = source.errors[code];
        const value = Number(rawValue || 0);
        const normalizedValue = Number.isFinite(value) ? value : 0;
        const [label, severity, description] = definition;

        aggregatedErrors[code] = Math.max(aggregatedErrors[code] || 0, normalizedValue);

        if (normalizedValue > 0) {
          const activeError = {
            code,
            value: normalizedValue,
            label,
            severity,
            description,
            ...source.metadata,
          };
          activeErrors.push(activeError);
          activeCodesForSource.push(code);
        }
      });

      sourceSummary.push({
        index: sourceIndex,
        ...source.metadata,
        active_codes: activeCodesForSource,
      });
    });

    data[0].metadata.ERRO = aggregatedErrors;
    data[0].metadata.erro_fontes = sourceSummary;
    data[0].metadata.erro_ativo = activeErrors.length > 0;
    data[0].metadata.erro_quantidade = activeErrors.length;
    data[0].metadata.erro_codigos = Array.from(new Set(activeErrors.map((error) => error.code))).join(", ");
    const errorDescriptions = activeErrors.map((error) => {
      const sensorInfo = error.sensor_number !== undefined ? `Sensor ${error.sensor_number} - ` : "";
      return sensorInfo + error.code + ": " + error.label;
    });
    data[0].metadata.erro_descricao = errorDescriptions.join(" | ");
    data[0].metadata.erro_detalhes = activeErrors;

    Object.keys(errorDefinitions).forEach((code) => {
      const value = Number(aggregatedErrors[code] || 0);
      data[0].metadata[code] = value;
    });

    if (activeErrors.length > 0) {
      data.push({
        variable: "ERRO",
        value: errorDescriptions.join(" | "),
        metadata: {
          active: true,
          quantidade: activeErrors.length,
          codigos: Array.from(new Set(activeErrors.map((error) => error.code))).join(", "),
          detalhes: activeErrors,
          ERRO: aggregatedErrors,
          fontes: sourceSummary,
        },
      });
    }
  };

  // Função para converter minutos em formato "hh:mm"
  const convertToTimeFormat = (minutes) => {
    if (typeof minutes === 'string' && minutes.includes(':')) {
      // Já está no formato "hh:mm"
      return minutes;
    }
    const mins = Number(minutes);
    const hours = Math.floor(mins / 60);
    const remainingMins = mins % 60;
    return `${String(hours).padStart(2, '0')}:${String(remainingMins).padStart(2, '0')}`;
  };

  const fields = [
    // "MOD",
    // "EN",
    // "RG",
    // "OBJ",
    // "LIM",
    // "DMaHh",
    // "DMaMi",
    // "IMiHh",
    // "IMiMi",
    // "AT",
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
    "ERRO",
    "PH",
    "OUTST",
    "ONDUR",
    "ONSTR"
  ];


  fields.forEach((field) => {
    if (jsonObj.hasOwnProperty(field)) {
      // ERRO e um objeto com codigos; o tratamento fica em addErrorFields.
      if (field === "ERRO") {
        return;
      }
      // DMaMi e IMiMi devem estar no formato string "hh:mm"
      if (["DMaMi", "IMiMi"].includes(field)) {
        data[0].metadata[field] = convertToTimeFormat(jsonObj[field]);
      } else if (["ONSTR", "ONDUR"].includes(field)) {
        // ONSTR e ONDUR devem permanecer como string (horários)
        // Mas só se tiver valor válido (não null/undefined/vazio)
        const value = jsonObj[field];
        if (value !== null && value !== undefined && value !== "") {
          data[0].metadata[field] = String(value);
        }
      } else {
        data[0].metadata[field] = Number(jsonObj[field]);
      }
    }
    if (
      ["OBJ", "LIM", "DMaMi", "IMiMi"].includes(field) &&
      jsonObj.hasOwnProperty(field)
    ) {
      data.push({
        variable: field,
        // DMaMi e IMiMi devem estar no formato string "hh:mm"
        value: ["DMaMi", "IMiMi"].includes(field) ? convertToTimeFormat(jsonObj[field]) : Number(jsonObj[field]),
      });
    }
  });

  // console.log(data);
  addErrorFields();
  return data;
}

// let payload = [
//   {
//     value:
//       '{"MOD":4,"EN":true,"RG":true,"OBJ":0,"LIM":0,"DMaHh":0,"DMaMi":0,"IMiHh":0,"IMiMi":0,"AT":0,"COMM":0,"LUX":0}',
//     variable: "payload",
//   },
// ];

const payload_raw = payload.find(
  (x) =>
    x.variable === "payload_raw" ||
    x.variable === "payload" ||
    x.variable === "data"
);

if (payload_raw) {
  const data = toTagoFormat(payload_raw.value);
  try {
    payload = payload.concat(
      data.map((x) => ({
        ...x,
      }))
    );
  } catch (e) {
    // Print the error to the Live Inspector.
    console.error(e);

    // Return the variable parse_error for debugging.
    payload = [{ variable: "parse_error", value: e.message }];
  }
}

// console.log(payload);
