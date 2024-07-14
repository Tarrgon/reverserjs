const navDropdownTrigger = document.querySelector("#nav-dropdown-trigger")
if (navDropdownTrigger) {
  const dropdown = navDropdownTrigger.parentElement.parentElement

  navDropdownTrigger.addEventListener("click", (e) => {
    e.stopPropagation()
    dropdown.classList.toggle("is-active")
  })
}


for (let burger of document.querySelectorAll(".navbar-burger")) {
  if (burger.getAttribute("data-target")) {
    burger.addEventListener("click", () => {
      document.getElementById(burger.getAttribute("data-target")).classList.toggle("is-active")
    })
  }
}