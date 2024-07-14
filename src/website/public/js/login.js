async function login(e) {
  e.preventDefault()

  let res = await fetch("/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ username: document.getElementById("username").value, password: document.getElementById("password").value })
  })

  if (res.ok) {
    window.location = "/"
  } else {
    console.error(`Error logging in.`)
  }
}