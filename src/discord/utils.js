let awaitingReponse = new Map()

process.on("message", (message) => {
  if (awaitingReponse.has(message.id)) {
    if (!message.unauthorized) awaitingReponse.get(message.id)(message.data)
    awaitingReponse.delete(message.id)
  }
})

module.exports = client => ({
  requestResponse: (data) => {
    return new Promise((resolve) => {
      let id
      do {
        id = Math.floor(Math.random() * 100000)
      } while (awaitingReponse.has(id))

      awaitingReponse.set(id, resolve)

      process.send({ id, data })
    })
  },

  addUserToArtist: async (fromUserId, artistDiscordId, artistName) => {
    let response = await client.utils.requestResponse({ fromUserId, type: "ADD_USER_TO_ARTIST", artistDiscordId, artistName })
    return response.id
  },

  getLinkedArtistId: async (fromUserId, discordId) => {
    let response = await client.utils.requestResponse({ fromUserId, type: "GET_LINKED_ARTIST_ID", discordId })
    return response.id
  },

  importUserMedia: async (fromUserId, artistDiscordId, createdAt, content, sourceUrl, images) => {
    return await client.utils.requestResponse({ fromUserId, type: "IMPORT_MEDIA", createdAt, content, artistDiscordId, sourceUrl, images })
  },

  setUserDefaultArtist: async (userId, artistId) => {
    await client.db.collection("users").updateOn({ _id: userId }, { $set: { defaultArtist: artistId } }, { upsert: true })
  },

  getUserDefaultArtist: async (userId) => {
    let data = await client.db.collection("users").findOne({ _id: userId })
    return data?.defaultArtist
  }
})