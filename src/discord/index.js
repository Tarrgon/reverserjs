const { Client } = require("discord.js")
const { MongoClient } = require("mongodb")
const fs = require("fs")

let ready = false

console.log("Starting...")

const config = require(`${__dirname}/../config.json`)

const client = new Client({ intents: ["Guilds"], rest: { timeout: 30000 } })


const commands = []
const commandFiles = fs.readdirSync(`${__dirname}/commands`).filter(file => file.endsWith(".js"))

for (const file of commandFiles) {
  const command = require(`${__dirname}/commands/${file}`)
  command.handler = command.handler.bind(command, client)
  if (command.autoComplete) {
    command.autoComplete = command.autoComplete.bind(command, client)
  }
  commands.push(command)
}

const buttons = []
const buttonFiles = fs.readdirSync(`${__dirname}/buttons`).filter(file => file.endsWith(".js"))

for (const file of buttonFiles) {
  const button = require(`${__dirname}/buttons/${file}`)
  button.handler = button.handler.bind(button, client)
  buttons.push(button)
}

const modals = []
const modalFiles = fs.readdirSync(`${__dirname}/modals`).filter(file => file.endsWith(".js"))

for (const file of modalFiles) {
  const modal = require(`${__dirname}/modals/${file}`)
  modal.handler = modal.handler.bind(modal, client)
  modals.push(modal)
}

const menus = []
const menuFiles = fs.readdirSync(`${__dirname}/menus`).filter(file => file.endsWith(".js"))

for (const file of menuFiles) {
  const menu = require(`${__dirname}/menus/${file}`)
  menu.handler = menu.handler.bind(menu, client)
  menus.push(menu)
}


client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand() && !interaction.isContextMenuCommand()) return

  if (!ready) {
    interaction.reply({ content: "Bot is still starting up. Please wait a few seconds.", ephemeral: true })
    return
  }

  for (let command of commands) {
    if (interaction.commandName == command.name) {
      command.handler(interaction)
      return
    }
  }
})

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isAutocomplete()) return

  if (!ready) return

  for (let command of commands) {
    if (interaction.commandName == command.name) {
      if (command.autoComplete) {
        command.autoComplete(interaction).catch(e => console.error(e))
      }
      return
    }
  }
})

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isButton()) return

  if (!ready) {
    interaction.reply({ content: "Bot is still starting up. Please wait a few seconds.", ephemeral: true })
    return
  }

  let id = interaction.customId.split("_")[0]

  for (let button of buttons) {
    if (id == button.name) {
      button.handler(interaction, interaction.customId.split("_")[1])
      return
    }
  }
})

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isModalSubmit()) return

  if (!ready) {
    interaction.reply({ content: "Bot is still starting up. Please wait a few seconds.", ephemeral: true })
    return
  }

  let id = interaction.customId.split("_")[0]

  for (let modal of modals) {
    if (id == modal.name) {
      modal.handler(interaction, interaction.customId.split("_")[1])
      return
    }
  }
})

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isAnySelectMenu()) return

  if (!ready) {
    interaction.reply({ content: "Bot is still starting up. Please wait a few seconds.", ephemeral: true })
    return
  }

  let id = interaction.customId.split("_")[0]

  for (let menu of menus) {
    if (id == menu.name) {
      menu.handler(interaction, interaction.customId.split("_")[1])
      return
    }
  }
})

client.on("ready", async () => {
  console.log(`Logged in as ${client.user.tag}!`)

  client.MongoClient = new MongoClient(config.mongo.url)

  await client.MongoClient.connect()

  client.db = client.MongoClient.db(config.mongo.databaseName)

  require(`${__dirname}/refresh_commands.js`)(client)

  for (let command of commands) {
    if (command.init) {
      command.init(client)
    }
  }

  for (let button of buttons) {
    if (button.init) {
      button.init(client)
    }
  }

  for (let modal of modals) {
    if (modal.init) {
      modal.init(client)
    }
  }

  ready = true
})

client.on("error", (e) => {
  console.error(e)
})

client.config = config
client.utils = require(`${__dirname}/utils.js`)(client)

client.login(config.discordBotToken)