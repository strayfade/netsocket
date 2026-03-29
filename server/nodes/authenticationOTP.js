const { string } = require('./utils/inputParser')

const { otpController } = require('./utils/authenticator')

class NodeDefinition {
    constructor() {
        this.addInput("Account", "string");
        this.addOutput("Code", "string");
        this.desc = "Generates a TOTP (SHA1) for the given account key (Issuer:Account name). Secrets are read from the Authentication preference \"OTP account secrets\" on each run so changes apply immediately."
    }
}
NodeDefinition.prototype.title = "Authentication/OTP"
NodeDefinition.prototype.color = "cyan"
const NodeFunction = async (node, params, behaviors) => {
    let output = await otpController.getCode(string(params.Account))
    await behaviors.populateNextNodeLinks([output]);
    return true
}
module.exports = { NodeDefinition, NodeFunction }