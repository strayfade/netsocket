let wsServerClients = []
const alert = async (text) => {
    wsServerClients.forEach((client) => {
        client.send(JSON.stringify({
            broadcastPurpose: "overlay",
            broadcastData: text
        }));
    });
}
const setWsServerConnectedClients = (newServerClients) => {
    wsServerClients = newServerClients;
}
module.exports = { alert, setWsServerConnectedClients }