const { log, logColors } = require('../log')
const { getNodes } = require('../manager/saveState')
const { executeGraph } = require('../manager/execute')

const onGenericWebhook = async ({ method, path, query, headers, body }) => {
    if (!getNodes().nodes) return;
    let nodes = getNodes().nodes.nodes
    for (i of nodes) {
        if (i.type == "Triggers/Webhook") {
            await executeGraph(i, {
                "Method": method || "",
                "Path": path || "",
                "Query": JSON.stringify(query || {}),
                "Headers": JSON.stringify(headers || {}),
                "Body": JSON.stringify(body || {})
            })
        }
    }
}

const onGitHubWebhook = async ({ eventType, deliveryId, payload }) => {
    const repoName = payload?.repository?.full_name || ""
    const senderLogin = payload?.sender?.login || ""
    const action = payload?.action || ""

    if (!getNodes().nodes) return;
    let nodes = getNodes().nodes.nodes
    for (i of nodes) {
        if (i.type == "Triggers/GitHub Webhook") {
            await executeGraph(i, {
                "Event Type": eventType || "",
                "Delivery ID": deliveryId || "",
                "Repository": repoName,
                "Action": action,
                "Sender": senderLogin,
                "Payload": JSON.stringify(payload || {})
            })
        }
    }

    log(`GitHub webhook received: ${eventType || "unknown"} (${repoName || "no-repo"})`, logColors.Success)
}

module.exports = { onGenericWebhook, onGitHubWebhook }
