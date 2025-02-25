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
      data[0].metadata[field] = Number(jsonObj[field]);
    }
    if (
      ["OBJ", "LIM", "DMaMi", "IMiMi"].includes(field) &&
      jsonObj.hasOwnProperty(field)
    ) {
      data.push({
        variable: field,
        value: Number(jsonObj[field]),
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

//console.log(payload);
