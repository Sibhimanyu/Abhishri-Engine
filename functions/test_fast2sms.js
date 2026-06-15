const admin = require("firebase-admin");
const axios = require("axios");

admin.initializeApp();

async function test() {
  try {
    const db = admin.firestore();
    const configSnap = await db.collection("configs").doc("whatsapp_main").get();
    const config = configSnap.data();

    if (!config || !config.apiKey) {
      console.log("No config found");
      return;
    }

    console.log("API Key found. Fetching templates...");
    const url = `https://www.fast2sms.com/dev/dlt_manager/whatsapp?authorization=${encodeURIComponent(config.apiKey)}&type=template`;
    const response = await axios.get(url, { headers: { authorization: config.apiKey } });
    console.log("SUCCESS:", JSON.stringify(response.data, null, 2));

  } catch (err) {
    if (err.response) {
      console.log("FAILED WITH RESPONSE:", err.response.status, JSON.stringify(err.response.data, null, 2));
    } else {
      console.log("FAILED WITHOUT RESPONSE:", err.message);
    }
  }
}

test();
