function toTagoFormat(value) {
  const jsonObj = JSON.parse(value);
  const data = [
    {
      variable: "data",
      value: "Values are on metadata",
      metadata: {},
    },
  ];

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
    "MOD",
    "EN",
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

  fields.forEach((field) => {
    if (jsonObj.hasOwnProperty(field)) {
      // DMaMi e IMiMi devem estar no formato string "hh:mm"
      if (["DMaMi", "IMiMi"].includes(field)) {
        data[0].metadata[field] = convertToTimeFormat(jsonObj[field]);
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
