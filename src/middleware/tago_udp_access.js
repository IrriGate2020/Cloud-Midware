const axios = require("axios");
const middleware_token = "e2c0ff17-7c70-4775-aab6-5bc26e7d3a9e";

/**
 * Resolve serie_num and verification_code
 * To get a valid Token
 * @param  {String} serie_num
 * @param  {String} verification_code
 * @return {Promise} Token
 */
function get_token(serie_num) {
  return new Promise((resolve, reject) => {
    let url = `https://api.tago.io/connector/resolve/${serie_num}`;

    let request_options = {
      url,
      headers: { Token: middleware_token },
    };

    axios(request_options)
      .then((result) => {
        if (!result.data) {
          return reject(result.statusText);
        }
        if (!result.data.status) {
          return reject(result.data.message || result);
        }
        resolve(result.data.result);
      })
      .catch(reject);
  });
}

exports.get_token = get_token;
