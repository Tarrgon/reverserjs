const { ModalBuilder, TextInputStyle, TextInputBuilder, ActionRowBuilder, ContextMenuCommandBuilder, ApplicationCommandType } = require("discord.js")

module.exports = {
  name: "Add user",
  data: new ContextMenuCommandBuilder()
    .setName("Add user")
    .setType(ApplicationCommandType.User),
  handler: async function (client, interaction) {
    let artistId = await client.utils.getLinkedArtistId(interaction.user.id, interaction.targetUser.id)

    if (artistId) {
      return await interaction.reply({ content: `Artist already linked to: https://reverser.yiff.today/artists/${artistId}`, ephemeral: true })
    }

    const modal = new ModalBuilder()
      .setCustomId(`add-artist_${interaction.targetUser.id}`)
      .setTitle("Add user to artist")

    const name = new TextInputBuilder()
      .setCustomId("name")
      .setLabel("Artist tag on E621")
      .setPlaceholder("Case-sensitive if connecting to an existing artist on reverser.")
      .setStyle(TextInputStyle.Short)
      .setRequired(true)

    modal.addComponents(new ActionRowBuilder().addComponents(name))

    return await interaction.showModal(modal)
  }
}