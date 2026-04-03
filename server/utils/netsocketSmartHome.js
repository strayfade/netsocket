const { log, logColors } = require('../log')

let devices = [
    { name: "Outlet", id: 2, commands: ["On", "Off"] }
]

const getDevices = async () => {
    return devices;
}

const serialPort = require('serialport')
let availAdapters = []
let ports = []
const discoverWirelessAdapters = async () => {
    try {
        const avail = await serialPort.SerialPort.list();
        for (i of avail) {
            if (i.vendorId == "303A" && i.productId == "1001" && i.path != "COM19") {
                let port = new serialPort.SerialPort({ path: i.path, baudRate: 115200 }, (err) => {
                    if (!err) {
                        log(`Connected to wireless adapter at ${i.path}`, logColors.Success)
                    }
                    else {
                        log(`Failed to connect to wireless adapter (${err})`, logColors.Error)
                    }
                })
                availAdapters.push(i.path)
                ports.push(port);
            }
        }
        log(`Available wireless adapters: ${JSON.stringify(availAdapters)}`)
    }
    catch (err) {
        log(`Failed to discover wireless adapters (${err})`, logColors.Error)
    }
}
const sendCommand = async (command) => {
    ports.forEach((port) => {
        port.write(`${command}\n`);
    })
}

discoverWirelessAdapters()

module.exports = { getDevices, discoverWirelessAdapters, sendCommand }