const axios = require("axios");
async function test() {
  const apiKey = process.env.FAST2SMS_API_KEY;
  if (!apiKey) {
    throw new Error("Set FAST2SMS_API_KEY before running this script. Never hardcode secrets in this file — it is committed to git.");
  }
  try {
    const response = await axios.post('https://www.fast2sms.com/dev/wallet', null, {
      headers: { 'authorization': apiKey }
    });
    console.log("SUCCESS:", response.data);
  } catch (error) {
    console.log("ERROR:", error.response ? error.response.data : error.message);
  }
}
test();
