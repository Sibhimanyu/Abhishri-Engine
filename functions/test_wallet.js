const axios = require("axios");
async function test() {
  try {
    const response = await axios.post('https://www.fast2sms.com/dev/wallet', null, {
      headers: { 'authorization': "***REDACTED-ROTATE-THIS-API-KEY***" }
    });
    console.log("SUCCESS:", response.data);
  } catch (error) {
    console.log("ERROR:", error.response ? error.response.data : error.message);
  }
}
test();
