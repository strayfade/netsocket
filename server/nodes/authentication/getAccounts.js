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
		Accounts: {"description":"Accounts produced by Get OTP Accounts.","structure":"JSON array (may be serialized as a string in some nodes).","mcpKey":"Accounts"},
	},
}
NodeDefinition.prototype.mcpPreferred = "Prefer when you need the list of account keys that can be used with the OTP node to generate a one-time password."
NodeDefinition.prototype.color = "cyan"
NodeDefinition.prototype.icon = "security"
const NodeFunction = async (node, params, behaviors) => {
    let output = JSON.stringify(await otpController.listCodes())
    await behaviors.populateNextNodeLinks([output]);
    return true
}
module.exports = { NodeDefinition, NodeFunction }