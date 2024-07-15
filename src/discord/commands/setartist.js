const { SlashCommandBuilder } = require("discord.js")

module.exports = {
  name: "setartist",
  data: new SlashCommandBuilder()
    .setName("setartist")
    .setDescription("Set the artist you're uploading to if the author isn't linked")
    .addUserOption(option =>
      option.setName("user")
        .setDescription("The discord user of the artist")
        .setRequired(true)
    ),
  handler: async function (client, interaction) {
    let id = interaction.options.getUser("user").id

    let artistId = await client.utils.getLinkedArtistId(interaction.user.id, id)

    if (artistId) {
      return await interaction.reply({ content: "Link user first.", ephemeral: true })
    }

    await client.utils.setUserDefaultArtist(interaction.user.id, id)

    return await interaction.reply({ content: "Default artist set.", ephemeral: true })
  }
}