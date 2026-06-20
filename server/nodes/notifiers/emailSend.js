const { log, logColors } = require('../../log')
const { string, bool } = require('../../utils/inputParser')
const settingsManager = require('../../manager/settingsManager')
const { sendEmail } = require('../../utils/emailSend')

require('../../manager/nodePreferencesRegistry').addPref(
    'Email',
    'email.smtp.host',
    'SMTP Host',
    'text',
    '',
    '<p>Hostname of your SMTP server (for example <code>smtp.example.com</code>).</p>'
)
require('../../manager/nodePreferencesRegistry').addPref(
    'Email',
    'email.smtp.port',
    'SMTP Port',
    'text',
    '587',
    '<p>SMTP port. Use <code>587</code> for STARTTLS or <code>465</code> for implicit TLS.</p>'
)
require('../../manager/nodePreferencesRegistry').addPref(
    'Email',
    'email.smtp.secure',
    'Use TLS',
    'text',
    'false',
    '<p>Set to <code>true</code> when connecting with implicit TLS (typically port 465).</p>'
)
require('../../manager/nodePreferencesRegistry').addPref(
    'Email',
    'email.smtp.user',
    'SMTP Username',
    'text',
    '',
    '<p>Username for SMTP authentication.</p>'
)
require('../../manager/nodePreferencesRegistry').addPref(
    'Email',
    'email.smtp.password',
    'SMTP Password',
    'text',
    '',
    '<p>Password for SMTP authentication.</p>'
)
require('../../manager/nodePreferencesRegistry').addPref(
    'Email',
    'email.from',
    'From Address',
    'text',
    '',
    '<p>Default sender email address.</p>'
)

class NodeDefinition {
    constructor() {
        this.addInput("", LiteGraph.EVENT);
        this.addInput("To", "string");
        this.addProperty("To", "");
        this.addInput("Subject", "string");
        this.addProperty("Subject", "");
        this.addInput("Text", "string");
        this.addProperty("Text", "");
        this.addInput("HTML", "string");
        this.addProperty("HTML", "");
        this.addOutput("Success", LiteGraph.EVENT);
        this.addOutput("Failed", LiteGraph.EVENT);
    }
}
NodeDefinition.prototype.title = "Notifiers/Email Send"
NodeDefinition.prototype.description = "Sends an email via configured SMTP settings with to, subject, plain text, and optional HTML body. Routes to Success or Failed depending on delivery outcome."
NodeDefinition.prototype.color = "blue"
NodeDefinition.prototype.icon = "mail"

const NodeFunction = async (node, params, behaviors) => {
    try {
        await sendEmail({
            host: settingsManager.getSetting('email.smtp.host'),
            port: Number(settingsManager.getSetting('email.smtp.port') || 587),
            secure: bool(settingsManager.getSetting('email.smtp.secure')),
            username: settingsManager.getSetting('email.smtp.user'),
            password: settingsManager.getSetting('email.smtp.password'),
            from: settingsManager.getSetting('email.from'),
            to: string(params.To),
            subject: string(params.Subject),
            text: string(params.Text),
            html: string(params.HTML) || null,
        })
        await behaviors.triggerNodeGroup(behaviors.getOutputNodeGroups()[0]);
        return true
    } catch (error) {
        log(`Email send failed: ${error.message}`, logColors.Error)
        await behaviors.triggerNodeGroup(behaviors.getOutputNodeGroups()[1]);
        return false
    }
}

module.exports = { NodeDefinition, NodeFunction }
