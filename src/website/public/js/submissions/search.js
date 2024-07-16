function statusSelectChanged(event) {
  // for (let fold of event.target.querySelectorAll("[data-open]")) {
  //   document.getElementById(fold.getAttribute("data-open")).classList.add("hidden")
  // }

  // if (event.target.options[event.target.selectedIndex].getAttribute("data-open")) {
  //   document.getElementById(event.target.options[event.target.selectedIndex].getAttribute("data-open")).classList.remove("hidden")
  // }
}

function openSearchOptions() {
  let openButton = document.getElementById("open-search-options")
  let closeButton = document.getElementById("close-search-options")

  openButton.classList.add("hidden")
  closeButton.classList.remove("hidden")

  document.getElementById("search-container").classList.remove("hidden")

  localStorage.setItem("searchOpened", "true")
}

function closeSearchOptions() {
  let openButton = document.getElementById("open-search-options")
  let closeButton = document.getElementById("close-search-options")

  openButton.classList.remove("hidden")
  closeButton.classList.add("hidden")

  document.getElementById("search-container").classList.add("hidden")

  localStorage.setItem("searchOpened", "false")
}

function toggleSelected(event, id) {
  let button = document.getElementById(id)

  let isNegatable = button.getAttribute("data-can-negate") == "true"

  if (!isNegatable) button.classList.toggle("is-selected")
  else {
    if (button.classList.contains("is-selected")) {
      button.classList.remove("is-selected")
      button.classList.add("is-negated")
    } else if (button.classList.contains("is-negated")) {
      button.classList.remove("is-negated")
    } else {
      button.classList.add("is-selected")
    }
  }
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
      if (!(nameHolder.firstElementChild.classList.contains("is-selected") || nameHolder.firstElementChild.classList.contains("is-negated"))) continue

      let value = nameHolder.firstElementChild.getAttribute("value")
      let isNegated = nameHolder.firstElementChild.classList.contains("is-negated")
      if (value != "") form.append(nameHolder.getAttribute("name"), (isNegated ? "-" : "") + value)
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

  for (let [name, value] of url.searchParams) {
    if (name == "page") continue
    
    let nameHolder

    let negated = false
    if (value.startsWith("-")) {
      value = value.slice(1)
      negated = true
    }

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
      if (!negated) nameHolder.firstElementChild.classList.add("is-selected")
      else nameHolder.firstElementChild.classList.add("is-negated")
    }
  }
}

fillFormWithUrlSearch()

if (localStorage.getItem("searchOpened") == "true") {
  openSearchOptions()
}