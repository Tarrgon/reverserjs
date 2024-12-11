let submissionsFunctions = {
  addSubmissionToBacklog: [
    async (event, id) => {
      let res = await fetch("/account/backlog", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ id })
      })

      if (!res.ok) {
        console.error(await res.text())
        return alert("Error, check console")
      }

      let addButton = document.getElementById(`add-to-backlog-${id}`)
      let removeButton = document.getElementById(`remove-from-backlog-${id}`)

      addButton.classList.add("hidden")
      removeButton.classList.remove("hidden")
    }
  ],

  removeSubmissionFromBacklog: [
    async (event, id) => {
      let res = await fetch("/account/backlog", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ id })
      })

      if (!res.ok) {
        console.error(await res.text())
        return alert("Error, check console")
      }

      let addButton = document.getElementById(`add-to-backlog-${id}`)
      let removeButton = document.getElementById(`remove-from-backlog-${id}`)

      addButton.classList.remove("hidden")
      removeButton.classList.add("hidden")
    }
  ],

  hideSubmission: [
    async (event, id) => {
      let res = await fetch("/account/hidden", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ id })
      })

      if (!res.ok) {
        console.error(await res.text())
        return alert("Error, check console")
      }

      let hideButton = document.getElementById(`hide-${id}`)
      let unhideButton = document.getElementById(`unhide-${id}`)

      hideButton.classList.add("hidden")
      unhideButton.classList.remove("hidden")
    }
  ],

  unhideSubmission: [
    async (event, id) => {
      let res = await fetch("/account/hidden", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ id })
      })

      if (!res.ok) {
        console.error(await res.text())
        return alert("Error, check console")
      }

      let hideButton = document.getElementById(`hide-${id}`)
      let unhideButton = document.getElementById(`unhide-${id}`)

      hideButton.classList.remove("hidden")
      unhideButton.classList.add("hidden")
    }
  ],

  backlogAll: [
    async (event, ids) => {
      let res = await fetch("/account/backlog/many", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ ids })
      })

      if (!res.ok) {
        console.error(await res.text())
        return alert("Error, check console")
      }

      for (let id of ids) {
        let addButton = document.getElementById(`add-to-backlog-${id}`)
        let removeButton = document.getElementById(`remove-from-backlog-${id}`)

        addButton.classList.add("hidden")
        removeButton.classList.remove("hidden")
      }
    }
  ],

  unbacklogAll: [
    async (event, ids) => {
      let res = await fetch("/account/backlog/many", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ ids })
      })

      if (!res.ok) {
        console.error(await res.text())
        return alert("Error, check console")
      }

      for (let id of ids) {
        let addButton = document.getElementById(`add-to-backlog-${id}`)
        let removeButton = document.getElementById(`remove-from-backlog-${id}`)

        addButton.classList.remove("hidden")
        removeButton.classList.add("hidden")
      }
    }
  ],

  hideAll: [
    async (event, ids) => {
      let res = await fetch("/account/hide/many", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ ids })
      })

      if (!res.ok) {
        console.error(await res.text())
        return alert("Error, check console")
      }

      for (let id of ids) {
        let hideButton = document.getElementById(`hide-${id}`)
        let unhideButton = document.getElementById(`unhide-${id}`)

        hideButton.classList.add("hidden")
        unhideButton.classList.remove("hidden")
      }
    }
  ],

  unhideAll: [
    async (event, ids) => {
      let res = await fetch("/account/hide/many", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ ids })
      })

      if (!res.ok) {
        console.error(await res.text())
        return alert("Error, check console")
      }

      for (let id of ids) {
        let hideButton = document.getElementById(`hide-${id}`)
        let unhideButton = document.getElementById(`unhide-${id}`)

        hideButton.classList.remove("hidden")
        unhideButton.classList.add("hidden")
      }
    }
  ],

  deleteSubmission: [
    async (event, id) => {
      let res = await fetch(`/submissions/${id}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json"
        }
      })

      if (!res.ok) {
        console.error(await res.text())
        return alert("Error, check console")
      }

      document.getElementById(`submission-${id}`).remove()
    }
  ],

  undeleteSubmission: [
    async (event, id) => {
      let res = await fetch(`/submissions/${id}/undelete`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        }
      })

      if (!res.ok) {
        console.error(await res.text())
        return alert("Error, check console")
      }

      document.getElementById(`undelete-${id}`).classList.add("hidden")
      document.getElementById(`delete-${id}`).classList.remove("hidden")
    }
  ],

  deleteAll: [
    async (event, ids) => {
      let res = await fetch(`/submissions/delete/many`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ ids })
      })

      if (!res.ok) {
        console.error(await res.text())
        return alert("Error, check console")
      }

      for (let id of ids) document.getElementById(`submission-${id}`).remove()
    }
  ],

  undeleteAll: [
    async (event, ids) => {
      let res = await fetch(`/submissions/undelete/many`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ ids })
      })

      if (!res.ok) {
        console.error(await res.text())
        return alert("Error, check console")
      }

      for (let id of ids) {
        document.getElementById(`undelete-${id}`).classList.add("hidden")
        document.getElementById(`delete-${id}`).classList.remove("hidden")
      }
    }
  ],

  regenerateAll: [
    async (event, ids) => {
      let res = await fetch(`/submissions/regeneratesamples/many`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ ids })
      })

      if (!res.ok) {
        console.error(await res.text())
        return alert("Error, check console")
      }

      alert("Done.")
    }
  ],
}

async function addSubmissionToBacklog(event, id) {
  for (let func of submissionsFunctions.addSubmissionToBacklog) {
    await func(event, id)
  }
}

async function removeSubmissionFromBacklog(event, id) {
  for (let func of submissionsFunctions.removeSubmissionFromBacklog) {
    await func(event, id)
  }
}

async function hideSubmission(event, id) {
  for (let func of submissionsFunctions.hideSubmission) {
    await func(event, id)
  }
}

async function unhideSubmission(event, id) {
  for (let func of submissionsFunctions.unhideSubmission) {
    await func(event, id)
  }
}

async function backlogAll(event) {
  let ids = []

  for (let element of document.querySelectorAll(".submission:has(.is-selected)")) {
    ids.push(parseInt(element.getAttribute("data-submission-id")))
  }

  for (let func of submissionsFunctions.backlogAll) {
    await func(event, ids)
  }
}

async function unbacklogAll(event) {
  let ids = []

  for (let element of document.querySelectorAll(".submission:has(.is-selected)")) {
    ids.push(parseInt(element.getAttribute("data-submission-id")))
  }

  for (let func of submissionsFunctions.unbacklogAll) {
    await func(event, ids)
  }
}

async function hideAll(event) {
  let ids = []

  let selected = Array.from(document.querySelectorAll(".submission:has(.is-selected)"))

  for (let element of selected) {
    ids.push(parseInt(element.getAttribute("data-submission-id")))
    element.classList.remove("is-selected")
  }

  for (let func of submissionsFunctions.hideAll) {
    await func(event, ids)
  }

  document.getElementById("mass-edit-container").classList.add("hidden")
}

async function unhideAll(event) {
  let ids = []

  for (let element of document.querySelectorAll(".submission:has(.is-selected)")) {
    ids.push(parseInt(element.getAttribute("data-submission-id")))
  }

  for (let func of submissionsFunctions.unhideAll) {
    await func(event, ids)
  }
}

async function updateAll(event) {
  let ids = []

  for (let element of document.querySelectorAll(".submission:has(.is-selected)")) {
    ids.push(parseInt(element.getAttribute("data-submission-id")))
  }

  for (let id of ids) updateSubmissionE621Iqdb(event, id, false)
}

async function deleteAll(event) {
  let ids = []

  for (let element of document.querySelectorAll(".submission:has(.is-selected)")) {
    ids.push(parseInt(element.getAttribute("data-submission-id")))
  }

  for (let func of submissionsFunctions.deleteAll) {
    await func(event, ids)
  }

  document.getElementById("mass-edit-container").classList.add("hidden")
}

async function undeleteAll(event) {
  let ids = []

  for (let element of document.querySelectorAll(".submission:has(.is-selected)")) {
    ids.push(parseInt(element.getAttribute("data-submission-id")))
  }

  for (let func of submissionsFunctions.undeleteAll) {
    await func(event, ids)
  }
}

async function regenerateAll(event) {
  let ids = []

  for (let element of document.querySelectorAll(".submission:has(.is-selected)")) {
    ids.push(parseInt(element.getAttribute("data-submission-id")))
  }

  for (let func of submissionsFunctions.regenerateAll) {
    await func(event, ids)
  }
}

async function deleteSubmission(event, id) {
  for (let func of submissionsFunctions.deleteSubmission) {
    await func(event, id)
  }
}

async function undeleteSubmission(event, id) {
  for (let func of submissionsFunctions.undeleteSubmission) {
    await func(event, id)
  }
}

function select(event, id) {
  let anySelected = document.querySelector(".submission .is-selected") != null
  if (anySelected || event.altKey) {
    event.stopImmediatePropagation()
    event.preventDefault()

    document.getElementById(`submission-card-${id}`).classList.toggle("is-selected")

    let container = document.getElementById("mass-edit-container")
    if (document.querySelector(".submission:has(.is-selected)")) {
      container.classList.remove("hidden")
      container.style.left = `${document.body.clientWidth - container.clientWidth}px`
    } else {
      container.classList.add("hidden")
    }
  }
}

async function updateSubmissionE621Iqdb(event, id, wait = true) {
  if (wait) {
    let button = document.getElementById(`update-iqdb-${id}`)
    button.classList.add("hidden")

    let waiting = document.getElementById(`waiting-iqdb-${id}`)
    waiting.classList.remove("hidden")
  }

  let res = await fetch(`/submissions/${id}/update${wait === false ? "?wait=false" : ""}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    }
  })

  if (wait) {
    let button = document.getElementById(`update-iqdb-${id}`)
    button.classList.remove("hidden")

    let waiting = document.getElementById(`waiting-iqdb-${id}`)
    waiting.classList.add("hidden")
  }

  if (!res.ok) {
    console.error(await res.text())
    return alert("Error, check console")
  }

  if (res.headers.get("content-type").startsWith("text/plain")) {
    let holder = document.getElementById(`hit-holder-${id}`)

    while (holder.hasChildNodes()) holder.firstChild.remove()
    return
  }

  let holder = document.getElementById(`hit-holder-${id}`)

  while (holder.hasChildNodes()) holder.firstChild.remove()

  let data = await res.json()

  // if (data.hits.length == 0) return holder.classList.add("hidden")

  for (let hit of data.hits) {
    let html =
      `
<span>
  <span class="has-text-info is-size-7"><a href="${hit.sourceUrl}">#${hit.id}</a></span>
  <span class="is-size-7">${hit.width}x${hit.height}, ${hit.humanReadableSize}, ${hit.fileType?.toUpperCase() ?? "<span class=\"has-text-danger\">DEL</span>"}</span>
  <span class="has-text-info is-size-7"><a href="${hit.directLink}">E6D</a></span>
  ${hit.md5 == data.submission.md5 ? `<span class="has-text-light is-size-7">Exact</span>` : ""}
  <i class="fa-solid fa-trash has-text-danger is-size-7" title="Delete hit" style="cursor: pointer;" onclick="deleteIqdbHit(event, ${id}, ${hit.id})"></i>
  <br />
</span>
`
    holder.insertAdjacentHTML("beforeend", html)
  }
}

async function clickUpload(event, id) {
  event.preventDefault()
  event.stopImmediatePropagation()

  let res = await fetch(`/submissions/${id}/upload-url`)
  let href = (await res.json()).url
  window.open(href)
  // let a = document.createElement("a")
  // a.href = href
  // a.target = "_blank"
  // a.click()
  // a.dispatchEvent(new MouseEvent("click", { button: 1, which: 2 }))
}

async function deleteIqdbHit(event, id, postId) {
  let res = await fetch(`/submissions/${id}/iqdbhits`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ postId })
  })

  if (!res.ok) {
    if (res.headers["Content-Type"] == "application/json") {
      let data = await res.json()
      if (data.isMd5Match) return alert("Cannot delete exact matches.")

      console.error(data)
      return alert("Error, check console")
    }
    console.error(await res.text())
    return alert("Error, check console")
  }

  event.target.parentElement.remove()
}

document.addEventListener("keydown", (event) => {
  if (event.code == "KeyA" && event.altKey && event.ctrlKey) {
    event.stopImmediatePropagation()
    event.preventDefault()
    let anySelected = document.querySelector(".submission .is-selected") != null

    if (anySelected) {
      for (let element of document.querySelectorAll(".submission .is-selected")) {
        element.classList.remove("is-selected")
      }
    } else {
      for (let element of document.querySelectorAll(".submission > *")) {
        element.classList.add("is-selected")
      }
    }

    let container = document.getElementById("mass-edit-container")
    if (document.querySelector(".submission:has(.is-selected)")) {
      container.classList.remove("hidden")
      container.style.left = `${document.body.clientWidth - container.clientWidth}px`
    } else {
      container.classList.add("hidden")
    }
  } else if (event.key == "Escape") {
    let anySelected = document.querySelector(".submission .is-selected") != null
    if (anySelected) {
      event.stopImmediatePropagation()
      event.preventDefault()
      for (let element of document.querySelectorAll(".submission .is-selected")) {
        element.classList.remove("is-selected")
      }

      let container = document.getElementById("mass-edit-container")
      container.classList.add("hidden")
    }
  }
})