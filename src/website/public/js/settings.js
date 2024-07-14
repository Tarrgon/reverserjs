async function submitSettings() {
  let container = document.getElementById("settings-container")
  let data = {}

  for (let nameHolder of container.querySelectorAll("[name]")) {
    if (nameHolder.tagName == "SELECT") {
      let value = nameHolder.options[nameHolder.selectedIndex].getAttribute("value")
      if (value != "") data[nameHolder.getAttribute("name")] = nameHolder.getAttribute("data-type") == "boolean" ? value == "true" : value
    } else if (nameHolder.tagName == "INPUT" || nameHolder.tagName == "TEXTAREA") {
      let value = nameHolder.value.trim()
      if (value != "") {
        if (nameHolder.getAttribute("type") == "number") value = parseFloat(value)
        data[nameHolder.getAttribute("name")] = value
      }
    } else if (nameHolder.tagName == "P") {
      if (!nameHolder.firstElementChild.classList.contains("is-selected")) continue

      let value = nameHolder.firstElementChild.getAttribute("value")
      if (value != "") data[nameHolder.getAttribute("name")] = value
    }
  }


  let res = await fetch("/account/edit", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(data)
  })

  if (!res.ok) {
    console.error(await res.text())
    return alert("Settings change failed. Check console")
  }

  alert("Settings saved.")
}