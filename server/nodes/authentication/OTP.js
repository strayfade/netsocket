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
		Account: {"description":"TOTP account identifier.","structure":"OTP account key in Issuer:Account format.","required":true},
	},
	outputs: {
		Code: {"description":"JavaScript or command text to run.","structure":"Source code or script string.","mcpKey":"Code"},
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