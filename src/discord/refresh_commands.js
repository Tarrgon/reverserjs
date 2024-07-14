const { REST } = require("@discordjs/rest")
const { Routes } = require("discord.js")
const { discordBotToken } = require("../config.json")
const fs = require("fs")

const rest = new REST({ version: "10" }).setToken(discordBotToken)

module.exports = (async (client) => {
	try {
		let commands = []
		let guildCommands = {}
		const commandFiles = fs.readdirSync(`${__dirname}/commands`).filter(file => file.endsWith(".js"))

		const extras = {
			"integration_types": [0, 1], //0 for guild, 1 for user
			"contexts": [0, 1, 2], //0 for guild, 1 for app DMs, 2 for GDMs and other DMs
		}

		for (const file of commandFiles) {
			const command = require(`${__dirname}/commands/${file}`)
			let data
			if (typeof (command.data) == "function") {
				data = (await command.data(client)).toJSON()
			} else {
				data = command.data.toJSON()
			}

			Object.keys(extras).forEach(key => data[key] = extras[key])

			if (!command.guilds) {
				commands.push(data)
			} else {
				for (let id of command.guilds) {
					if (!guildCommands[id]) guildCommands[id] = []
					guildCommands[id].push(data)
				}
			}
		}
		console.log("Started refreshing application (/) commands.")

		console.log("Global commands: " + commands.length)
		await rest.put(
			Routes.applicationCommands(client.user.id),
			{ body: commands },
		)

		for (const guild in guildCommands) {
			console.log("Guild commands: " + guildCommands[guild].length + " (" + guild + ")")
			await rest.put(
				Routes.applicationGuildCommands(client.user.id, guild),
				{ body: guildCommands[guild] },
			)
		}

		console.log("Successfully reloaded application (/) commands.")
	} catch (error) {
		console.error(error)
		console.error(JSON.stringify(error.requestBody, null, 4))
	}
})