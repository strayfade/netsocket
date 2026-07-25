const crypto = require('node:crypto')
const { string } = require('../../utils/inputParser')

class NodeDefinition {
    constructor() {
        this.addInput("Text", "string");
        this.addProperty("Text", "");
        this.addInput("Secret", "string");
        this.addProperty("Secret", "");
        this.addInput("Encoding", "string");
        this.addEnumProperty("Encoding", "hex", ["hex", "base64"]);
        this.addOutput("Digest", "string");
    }
}
NodeDefinition.prototype.title = "Hash/HMAC-SHA256"
NodeDefinition.prototype.description = "Computes an HMAC-SHA256 of the input text using a secret key. Encoding may be hex or base64."
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.icon = "key"
const NodeFunction = async (node, params, behaviors) => {
    const encoding = string(params.Encoding) === "base64" ? "base64" : "hex";
    const digest = crypto.createHmac("sha256", string(params.Secret)).update(string(params.Text)).digest(encoding);
    await behaviors.populateNextNodeLinks([digest]);
    return true;
}
module.exports = { NodeDefinition, NodeFunction }
