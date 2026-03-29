const path = require('path')
const config = {
    storage: {
        nodes: path.join(__dirname, "../../.state.json"),
        users: path.join(__dirname, "../../.users.json"),
        credentials: path.join(__dirname, "../../.credentials.json"),
        vars: path.join(__dirname, "../../.vars.json"),
        settings: path.join(__dirname, "../../.settings.json")
    },
    netsocket: {
        username: "strayfade",
        password: atob("dDQ1WG49bTckKExlWlJpcEhVLVd9UDtdN00lJCwrR1NHVGs2MGhIMXdYTXk9Y005OWZLdTE1OUM2OUcrLjR5ZTZ2JmhoQEVTXzZFRzhjKmhQTWovenVTKGg3amJqJUJMP2cuKSsteC81TiwvJjc0ZjJ6IyZWM0xGRSZHdDlkLndrLnt4TVlMKG0jQmh0aWIhOFFhaVA0cTV2e2dHdFtXanVoJWZyMiwzUk0oRi5nSzk6My1Id0QofXI2LyUlYipMY256MCxZKC1EOCYoK1RiJldjXUctYVMzKHhtZ2omMHZEY0B4fSlAcHgqYipKSFt1PTlEeXtQMDdCNjBpP3R2dA==")
    }
}

module.exports = { config }