async function createAccount(e) {
  e.preventDefault()

  let res = await fetch("/account/new", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ username: document.getElementById("username").value, password: document.getElementById("password").value })
  })

  if (!res.ok) {
    console.error(await res.text())
    return alert("Error creating account. Check console")
  } else {
    alert("Created")
  }
}