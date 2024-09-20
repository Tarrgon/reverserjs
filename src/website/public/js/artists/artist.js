let artistName = document.getElementById("artist-name")

let editNameButton = document.getElementById("edit-name-button")
let saveNameButton = document.getElementById("save-name-button")
let discardNameButton = document.getElementById("discard-name-button")

let savedName = artistName.innerText.trim()

function beginArtistNameEdit() {
  artistName.setAttribute("contenteditable", "true")
  artistName.classList.add("has-text-info")
  editNameButton.classList.add("hidden")
  saveNameButton.classList.remove("hidden")
  discardNameButton.classList.remove("hidden")
}

async function saveArtistNameEdit(id) {
  artistName.removeAttribute("contenteditable")
  artistName.classList.remove("has-text-info")
  editNameButton.classList.remove("hidden")
  saveNameButton.classList.add("hidden")
  discardNameButton.classList.add("hidden")

  let temp = savedName
  savedName = artistName.innerText.trim()

  try {
    let res = await fetch(`/artists/${id}/edit`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ name: savedName })
    })

    if (!res.ok) {
      console.error(await res.text())

      savedName = temp
      artistName.innerText = savedName

      alert("Error setting name. Check console")
    }
  } catch (e) {
    console.error(e)

    savedName = temp
    artistName.innerText = savedName

    alert("Error setting name. Check console")
  }
}

function discardArtistNameEdit() {
  artistName.removeAttribute("contenteditable")
  artistName.classList.remove("has-text-info")
  artistName.innerText = savedName
  editNameButton.classList.remove("hidden")
  saveNameButton.classList.add("hidden")
  discardNameButton.classList.add("hidden")
}

async function removeUrlFromArtist(artistUrlId, urlId) {
  let urlElement = document.getElementById(`url-${urlId}`)

  try {
    let res = await fetch(`/artists/${artistUrlId}/edit`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ urlsToRemove: [urlId] })
    })

    if (!res.ok) {
      console.error(await res.text())

      alert("Error removing url. Check console")
    } else {
      urlElement.remove()
    }
  } catch (e) {
    console.error(e)

    alert("Error removing url. Check console")
  }
}

async function purgeBeforeChanged(event, artistUrlId) {
  let date = new Date(event.target.value)

  if (!confirm(`This action will purge every submission prior to ${date.toUTCString()}. Continue?`)) return

  try {
    let res = await fetch(`/artists/${artistUrlId}/edit`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ purgeBefore: date })
    })

    if (!res.ok) {
      console.error(await res.text())

      alert("Error setting. Check console")
    } else {
      window.location.reload()
    }
  } catch (e) {
    console.error(e)

    alert("Error setting. Check console")
  }
}

function openSettings() {
  let settings = document.getElementById("collapsible-settings")
  let openButton = document.getElementById("open-settings-button")
  let closeButton = document.getElementById("close-settings-button")

  openButton.classList.add("hidden")
  closeButton.classList.remove("hidden")

  settings.classList.remove("hidden")
}

function closeSettings() {
  let settings = document.getElementById("collapsible-settings")
  let openButton = document.getElementById("open-settings-button")
  let closeButton = document.getElementById("close-settings-button")

  closeButton.classList.add("hidden")
  openButton.classList.remove("hidden")

  settings.classList.add("hidden")
}

async function beginUrlAdd(artistUrlId) {
  let url = prompt("URL to add")
  if (!url || url.trim().length == 0) return

  try {
    let res = await fetch(`/artists/${artistUrlId}/edit`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ urlsToAdd: [url] })
    })

    if (!res.ok) {
      console.error(await res.text())

      alert("Error adding url. Check console")
    } else {
      window.location.reload()
    }
  } catch (e) {
    console.error(e)

    alert("Error adding url. Check console")
  }
}

async function beginNoteAdd(artistUrlId) {
  let note = prompt("Note to add")
  if (!note || note.trim().length == 0) return

  try {
    let res = await fetch(`/artists/${artistUrlId}/edit`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ notesToAdd: [note.trim()] })
    })

    if (!res.ok) {
      console.error(await res.text())

      alert("Error adding note. Check console")
    } else {
      window.location.reload()
    }
  } catch (e) {
    console.error(await res.text())

    alert("Error adding note. Check console")
  }
}


async function removeNoteFromArtist(artistUrlId, index) {
  try {
    let res = await fetch(`/artists/${artistUrlId}/edit`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ notesToRemove: [index] })
    })

    if (!res.ok) {
      console.error(await res.text())

      alert("Error removing note. Check console")
    } else {
      window.location.reload()
    }
  } catch (e) {
    console.error(e)

    alert("Error removing note. Check console")
  }
}

async function queueScrape(id) {
  try {
    let res = await fetch(`/artists/urls/${id}/queue`, {
      method: "POST"
    })

    if (!res.ok) {
      console.error(await res.text())

      alert("Error queuing url. Check console")
    } else {
      document.getElementById(`queue-button-${id}`).classList.add("hidden")
      document.getElementById(`queued-spinner-${id}`).classList.remove("hidden")
    }
  } catch (e) {
    console.error(e)

    alert("Error queuing url. Check console")
  }
}

function forceQueueScrape(event, id) {
  if (!event.ctrlKey) return

  queueScrape(id)
}