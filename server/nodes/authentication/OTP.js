const { string } = require('../../utils/inputParser')

const { otpController } = require('../../utils/authenticator')

class NodeDefinition {
    constructor() {
        this.addInput("Account", "string");
        this.addOutput("Code", "string");
        this.desc = "Generates a TOTP (SHA1) for the given account key (Issuer:Account name). Secrets are read from the Authentication preference \"OTP account secrets\" on each run so changes apply immediately."
    }
}
NodeDefinition.prototype.title = "Authentication/OTP"
NodeDefinition.prototype.description = "Generates a time-based one-time password (TOTP) for a named account using secrets stored in authentication preferences. Outputs the current numeric code string."
NodeDefinition.prototype.portMeta = {
	inputs: {
		Account: {"description":"TOTP account identifier — use the Issuer:Account key from Get OTP Accounts.","structure":"OTP account key in Issuer:Account format (e.g. \"Discord:Strayfade\"). For email-based accounts the Issuer prefix is still required; list accounts first if unsure.","required":true},
	},
	outputs: {
		Code: {"description":"Current 6-digit time-based OTP code for the account (rotates ~30s).","structure":"6-digit numeric string; re-execute the node if the code is rejected due to expiry.","mcpKey":"Code"},
	},
}
NodeDefinition.prototype.mcpPreferred = "Prefer for generating a 6-digit two-factor authentication code for a configured account key (Issuer:Account name)."
NodeDefinition.prototype.color = "cyan"
NodeDefinition.prototype.icon = "security"
const NodeFunction = async (node, params, behaviors) => {
    let output = await otpController.getCode(string(params.Account))
    await behaviors.populateNextNodeLinks([output]);
    return true
}
module.exports = { NodeDefinition, NodeFunction }