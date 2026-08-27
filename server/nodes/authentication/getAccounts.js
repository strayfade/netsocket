const { otpController } = require('../../utils/authenticator')

class NodeDefinition {
    constructor() {
        this.addOutput("Accounts", "array");
        this.desc = "Lists OTP account keys (Issuer:Account name) from the Authentication preference \"OTP account secrets\". Configure accounts there using Issuer:Name:Secret per entry, comma-separated."
    }
}
NodeDefinition.prototype.title = "Authentication/Get OTP Accounts"
NodeDefinition.prototype.description = "Lists all configured OTP account keys (Issuer:Account name) from server authentication preferences. Outputs the account list as a JSON array string."
NodeDefinition.prototype.portMeta = {
	inputs: {

	},
	outputs: {
		Accounts: {"description":"List of OTP account keys (Issuer:Account). Parse the JSON string then pass one entry to Authentication/OTP input Account, or use JSON/Get Array Item with Index=0 to extract a single key.","structure":"JSON array string of Issuer:Account keys (e.g. [\"Discord:Strayfade\"]). Must be JSON.parsed or fed to JSON/Get Array Item before chaining to OTP.","mcpKey":"Accounts"},
	},
}
NodeDefinition.prototype.mcpPreferred = "Prefer when you need the list of account keys that can be used with the OTP node to generate a one-time password. Chain: Get OTP Accounts → JSON/Get Array Item (Array=Accounts, Index=0) → OTP (Account=that value)."
NodeDefinition.prototype.color = "cyan"
NodeDefinition.prototype.icon = "security"
const NodeFunction = async (node, params, behaviors) => {
    let output = JSON.stringify(await otpController.listCodes())
    await behaviors.populateNextNodeLinks([output]);
    return true
}
module.exports = { NodeDefinition, NodeFunction }