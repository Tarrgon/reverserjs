function openSearchOptions() {
  let openButton = document.getElementById("open-search-options")
  let closeButton = document.getElementById("close-search-options")

  openButton.classList.add("hidden")
  closeButton.classList.remove("hidden")

  document.getElementById("search-container").classList.remove("hidden")

  localStorage.setItem("artistSearchOpened", "true")
}

function closeSearchOptions() {
  let openButton = document.getElementById("open-search-options")
  let closeButton = document.getElementById("close-search-options")

  openButton.classList.remove("hidden")
  closeButton.classList.add("hidden")

  document.getElementById("search-container").classList.add("hidden")

  localStorage.setItem("artistSearchOpened", "false")
}

function toggleSelected(event, id) {
  let button = document.getElementById(id)
  button.classList.toggle("is-selected")
}

async function search() {
  let container = document.getElementById("search-container")
  let form = new FormData()

  for (let nameHolder of container.querySelectorAll("[name]")) {
    if (nameHolder.tagName == "SELECT") {
      let value = nameHolder.options[nameHolder.selectedIndex].getAttribute("value")
      if (value != "") form.append(nameHolder.getAttribute("name"), value)
    } else if (nameHolder.tagName == "INPUT" || nameHolder.tagName == "TEXTAREA") {
      let value = nameHolder.value
      if (value != "") form.append(nameHolder.getAttribute("name"), value)
    } else if (nameHolder.tagName == "P") {
      if (!nameHolder.firstElementChild.classList.contains("is-selected")) continue

      let value = nameHolder.firstElementChild.getAttribute("value")
      if (value != "") form.append(nameHolder.getAttribute("name"), value)
    }
  }

  const params = new URLSearchParams(form)
  let url = new URL(window.location.href)

  url.search = params.toString()

  window.location.href = url.toString()
}

function expandOrCollapse(event, targetId) {
  let target = document.getElementById(targetId)
  target.classList.toggle("hidden")

  let expandButton = event.currentTarget.querySelector("#expand")
  let collapseButton = event.currentTarget.querySelector("#collapse")

  expandButton.classList.toggle("hidden")
  collapseButton.classList.toggle("hidden")

  event.currentTarget.parentElement.classList.toggle("is-offset-1")
}

function fillFormWithUrlSearch() {
  let url = new URL(window.location.href)

  for (const [name, value] of url.searchParams) {
    if (name == "page") continue
    
    let nameHolder

    if (!name.endsWith("[]")) nameHolder = document.querySelector(`[name="${name}"]`)
    else nameHolder = document.querySelector(`[value="${value}"]`).parentElement

    if (!nameHolder) {
      console.warn(`Unknown search param: ${name}`)
      continue
    }

    if (nameHolder.tagName == "SELECT") {
      for (let i = 0; i < nameHolder.options.length; i++) {
        let option = nameHolder.options[i]
        if (option.getAttribute("value") == value) {
          nameHolder.options.selectedIndex = i
          break
        }
      }
    } else if (nameHolder.tagName == "INPUT" || nameHolder.tagName == "TEXTAREA") {
      nameHolder.value = value
    } else if (nameHolder.tagName == "P") {
      nameHolder.firstElementChild.classList.add("is-selected")
    }
  }
}

fillFormWithUrlSearch()

if (localStorage.getItem("artistSearchOpened") == "true") {
  openSearchOptions()
}