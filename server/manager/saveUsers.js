const path = require('path')
const fs = require('fs').promises
const { config } = require('../config')

let tokenDict = [];
const populateUsers = async () => {
    try {
        tokenDict = JSON.parse(await fs.readFile(config.storage.users, { encoding: "utf-8" }))
    }
    catch {
        tokenDict = [];
        await fs.writeFile(config.storage.users, JSON.stringify(tokenDict), { encoding: "utf-8" })
    }
}
const saveUsers = async () => {
    await fs.writeFile(config.storage.users, JSON.stringify(tokenDict), { encoding: "utf-8" })
}
setInterval(saveUsers, 1000)

const getUsers = () => {
    return tokenDict
}
const setUsers = (newDict) => {
    tokenDict = newDict
}

module.exports = { getUsers, setUsers, populateUsers }