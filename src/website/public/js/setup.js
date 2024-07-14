async function finishSetup(e) {
  e.preventDefault()

  let password = document.getElementById("password").value
  let passwordConfirmation = document.getElementById("password-confirm").value

  if (password != passwordConfirmation) {
    return alert("Passwords don't match")
  }

  let res = await fetch("/setup", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ password })
  })

  if (res.ok) {
    window.location = "/"
  } else {
    console.error(`Error logging in.`)
  }
}