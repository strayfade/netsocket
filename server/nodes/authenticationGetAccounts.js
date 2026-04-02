const { otpController } = require('./utils/authenticator')

class NodeDefinition {
    constructor() {
        this.addOutput("Accounts", "array");
        this.desc = "Lists OTP account keys (Issuer:Account name) from the Authentication preference \"OTP account secrets\". Configure accounts there using Issuer:Name:Secret per entry, comma-separated."
    }
}
NodeDefinition.prototype.title = "Authentication/Get OTP Accounts"
NodeDefinition.prototype.color = "cyan"
NodeDefinition.prototype.icon = "security"
const NodeFunction = async (node, params, behaviors) => {
    let output = JSON.stringify(await otpController.listCodes())
    await behaviors.populateNextNodeLinks([output]);
    return true
}
module.exports = { NodeDefinition, NodeFunction }