const { ContextMenuCommandBuilder, ApplicationCommandType } = require("discord.js")

module.exports = {
  name: "Import media",
  data: new ContextMenuCommandBuilder()
    .setName("Import media")
    .setType(ApplicationCommandType.Message),
  handler: async function (client, interaction) {
    let message = interaction.targetMessage
    let images = []
    let promises = []

    let artistDiscordId = message.author.id

    if (!(await client.utils.getLinkedArtistId(interaction.user.id, artistDiscordId))) {
      let defaultArtistId = await client.utils.getUserDefaultArtist(interaction.user.id)

      if (!defaultArtistId) return await interaction.reply({ content: "Link artist first.", ephemeral: true })

      artistDiscordId = defaultArtistId
    }

    let sourceUrl = `https://discord.com/channels/${interaction.guildId}/${message.channelId}/${message.id}`

    let unableToAdd = 0
    let errors = 0

    await interaction.deferReply({ ephemeral: true })

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for (let [_, attachment] of message.attachments) {
      promises.push(new Promise(async (resolve) => {
        try {
          let directUrl = attachment.url
          let offsiteId = attachment.id
          let res = await fetch(attachment.url)
          let blob = await res.blob()
          if (!(blob.type.startsWith("image/") || blob.type.startsWith("video/"))) {
            unableToAdd++
            return resolve()
          }
          let arrayBuffer = await blob.arrayBuffer()
          images.push({ directUrl, type: blob.type, offsiteId, buffer: Buffer.from(arrayBuffer) })
        } catch (e) {
          errors++
          console.error(e)
        }
        resolve()
      }))
    }

    await Promise.all(promises)

    if (images == 0) return await interaction.editReply({ content: "No attachments", ephemeral: true })

    let { added, existing, code } = await client.utils.importUserMedia(interaction.user.id, artistDiscordId, message.createdTimestamp, message.content, sourceUrl, images)

    if (code == 404) {
      return await interaction.editReply({ content: "Artist url not found.", ephemeral: true })
    }

    await interaction.editReply({ content: `Imported! Added: ${added} | Existing: ${existing} | Unable to be added (invalid content type): ${unableToAdd} |  Errors: ${errors}`, ephemeral: true })
  }
}