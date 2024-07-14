const pager = document.getElementById("pager")
let currentPage = parseInt(new URL(window.location.href).searchParams.get("page") ?? 1)

function gotoPage(page) {
  let url = new URL(window.location.href)

  url.searchParams.set("page", page)

  window.location.href = url.toString()
}

function createPage(page) {
  let span = document.createElement("span")
  span.classList.add("mr-1", "button", "is-small", "is-outlined")
  span.innerText = page

  if (page != currentPage) {
    span.classList.add("has-text-info", "is-dark")
    span.style.cursor = "pointer"
    span.onclick = () => {
      gotoPage(page)
    }
  } else {
    span.classList.add("has-text-light", "is-light")
  }

  return span
}

function createPrev() {
  let span = document.createElement("span")
  span.classList.add("mr-1", "button", "is-small", "is-outlined")
  span.innerText = "< Prev"

  if (currentPage > 1) {
    span.classList.add("has-text-info", "is-dark")
    span.style.cursor = "pointer"
    span.onclick = () => {
      gotoPage(currentPage - 1)
    }
  } else {
    span.classList.add("has-text-light", "is-light")
  }

  return span
}

function createNext(totalPages) {
  let span = document.createElement("span")
  span.classList.add("button", "is-small", "is-outlined")
  span.innerText = "Next >"

  if (currentPage < totalPages) {
    span.classList.add("has-text-info", "is-dark")
    span.style.cursor = "pointer"
    span.onclick = () => {
      gotoPage(currentPage + 1)
    }
  } else {
    span.classList.add("has-text-light", "is-light")
  }

  return span
}

function createSpacer(totalPages) {
  let span = document.createElement("span")
  span.classList.add("mr-1", "has-text-light")
  span.innerText = "..."
  span.style.cursor = "pointer"

  span.addEventListener("click", () => {
    let num = parseInt(prompt(`Enter page number 1-${totalPages}`))
    if (!isNaN(num)) gotoPage(num)
  })

  return span
}

function setupPager(totalPages) {
  while (pager.firstChild) pager.firstChild.remove() 

  let minPage = currentPage - 6
  let maxPage = currentPage + 6

  if (minPage < 1) minPage = 1
  if (maxPage > totalPages) maxPage = totalPages

  let includeFirst = minPage != 1
  let includeLast = maxPage != totalPages

  pager.append(createPrev())

  if (includeFirst) {
    pager.append(createPage(1))
    pager.append(createSpacer(totalPages))
  }

  for (let i = minPage; i <= maxPage; i++) {
    pager.append(createPage(i))
  }

  if (includeLast) {
    pager.append(createSpacer(totalPages))
    pager.append(createPage(totalPages))
  }

  pager.append(createNext(totalPages))
}