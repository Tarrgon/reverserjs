async function addArtist(e) {
  e.preventDefault()

  let data = { name: document.getElementById("name").value.trim(), urls: document.getElementById("urls").value.split("\n").map(u => u.trim()), isCommissioner: document.getElementById("is-commissioner").checked, notes: document.getElementById("notes").value.trim() }

  if (data.name.length == 0 || urls.length == 0) {
    return 
  }

  let res = await fetch("/artists/new", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(data)
  })

  if (res.ok) {
    window.location.pathname = "/artists"
  }
}