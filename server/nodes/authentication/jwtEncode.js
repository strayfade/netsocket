const { string, number, json } = require('../../utils/inputParser')
const { encodeJwt } = require('../../utils/jwtTools')

class NodeDefinition {
    constructor() {
        this.addInput("Payload", "object");
        this.addProperty("Payload", "{}");
        this.addInput("Secret", "string");
        this.addProperty("Secret", "");
        this.addInput("Algorithm", "string");
        this.addEnumProperty("Algorithm", "HS256", ["HS256", "HS384", "HS512"]);
        this.addInput("Expires In Seconds", "number");
        this.addProperty("Expires In Seconds", "3600");
        this.addOutput("Token", "string");
    }
}
NodeDefinition.prototype.title = "Authentication/JWT Encode"
NodeDefinition.prototype.description = "Creates a signed JWT (HS256/HS384/HS512) from a JSON payload and secret."
NodeDefinition.prototype.color = "cyan"
NodeDefinition.prototype.icon = "key"
const NodeFunction = async (node, params, behaviors) => {
    try {
        const token = encodeJwt(json(params.Payload), string(params.Secret), {
            algorithm: string(params.Algorithm),
            expiresInSeconds: number(params["Expires In Seconds"]),
        });
        await behaviors.populateNextNodeLinks([token]);
        return true;
    } catch (e) {
        await behaviors.populateNextNodeLinks([""]);
        return false;
    }
}
module.exports = { NodeDefinition, NodeFunction }
