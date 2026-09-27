// The two Zoho Cliq functions behind the Approve / Send back buttons, as Deluge source to
// paste into Cliq (Bots & Tools > Functions). Settings > Cliq Bot shows them filled in with
// this project's endpoint and secret; see docs/cliq-bot.md.
//
// - The Button function gets the button's key. Approve posts it straight to cliqAction;
//   Send back first returns a form asking for a note, carrying the key in a hidden field.
// - The Form function's Submit Handler posts the key and note to cliqAction.
// Both show cliqAction's reply to the admin who clicked, as a banner.

export const CLIQ_ACTION_URL = 'https://us-central1-abhishri-academy.cloudfunctions.net/cliqAction';
export const DEFAULT_BUTTON_FUNCTION = 'abhishriapproval';
export const DEFAULT_FORM_FUNCTION = 'abhishrisendback';

const callAction = (secret) => `response = invokeurl
[
	url :"${CLIQ_ACTION_URL}"
	type :POST
	parameters:payload.toString()
	headers:{"Content-Type":"application/json","X-Abhishri-Secret":"${secret}"}
];
status = ifnull(response.get("status"),"failure");
text = ifnull(response.get("text"),"Something went wrong. Please review it in the app.");
return {"type":"banner","text":text,"status":status};`;

export function buttonFunctionCode({ secret, formFunction = DEFAULT_FORM_FUNCTION }) {
  return `key = arguments.get("key");
if(key == null)
{
	key = target.get("key");
}
if(key.startsWith("s|"))
{
	inputs = list();
	inputs.add({"type":"textarea","name":"note","label":"What needs changing?","placeholder":"e.g. Fix the Tamil date","mandatory":true,"max_length":1000});
	inputs.add({"type":"hidden","name":"key","value":key});
	return {"type":"form","title":"Send back for changes","hint":"The teacher gets this note in Cliq and in the app.","name":"sendback","version":1,"button_label":"Send back","action":{"type":"invoke.function","name":"${formFunction}"},"inputs":inputs};
}
payload = Map();
payload.put("key",key);
payload.put("email",user.get("email"));
${callAction(secret)}`;
}

export function formFunctionCode({ secret }) {
  return `values = form.get("values");
payload = Map();
payload.put("key",values.get("key"));
payload.put("note",values.get("note"));
payload.put("email",user.get("email"));
${callAction(secret)}`;
}
