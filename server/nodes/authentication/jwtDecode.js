const { string } = require('../../utils/inputParser')
const { decodeJwt, verifyJwtSignature } = require('../../utils/jwtTools')

class NodeDefinition {
    constructor() {
        this.addInput("Token", "string");
        this.addProperty("Token", "");
        this.addInput("Secret", "string");
        this.addProperty("Secret", "");
        this.addOutput("Header", "string");
        this.addOutput("Payload", "string");
        this.addOutput("Verified", "boolean");
    }
}
NodeDefinition.prototype.title = "Authentication/JWT Decode"
NodeDefinition.prototype.description = "Decodes a JWT token into its header and payload as JSON strings. Optionally verifies the signature when a secret is provided and outputs whether verification succeeded."
NodeDefinition.prototype.color = "cyan"
NodeDefinition.prototype.icon = "key"

const NodeFunction = async (node, params, behaviors) => {
    const token = string(params.Token)
    const decoded = decodeJwt(token)
    const secret = string(params.Secret)
    const verified = decoded.valid
        && secret.length > 0
        && verifyJwtSignature(token, secret)

    await behaviors.populateNextNodeLinks([
        decoded.header ? JSON.stringify(decoded.header) : "",
        decoded.payload ? JSON.stringify(decoded.payload) : "",
        verified,
    ]);
    return decoded.valid
}

module.exports = { NodeDefinition, NodeFunction }
