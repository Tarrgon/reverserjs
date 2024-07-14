const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionsBitField, AttachmentBuilder } = require("discord.js")

module.exports = {
  name: "add-artist",
  handler: async function (client, interaction, artistDiscordId) {
    let name = interaction.fields.getTextInputValue("name")

    let artistId = await client.utils.addUserToArtist(interaction.user.id, artistDiscordId, name.trim())

    await interaction.reply({ content: `Added. https://reverser.yiff.today/artists/${artistId}`, ephemeral: true})
  }
}