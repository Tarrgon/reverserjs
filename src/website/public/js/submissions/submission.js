const ALLOWED_EXTENSIONS = ["mp4", "webm", "ogg", "png", "jpg", "jpeg", "gif", "apng", "avif", "webp"]
const VIDEO_EXTENSIONS = ["mp4", "webm", "ogg"]

let previewContainer = document.getElementById("preview-container")
let previewImageContainer = document.getElementById("preview-image-container")
let previewImage = document.getElementById("preview-image")
let previewVideoContainer = document.getElementById("preview-video-container")
let previewVideo = document.getElementById("preview-video")

let previewing = false

function startPreviewing(fileType, url) {
  previewing = true

  if (!VIDEO_EXTENSIONS.includes(fileType)) {
    previewImageContainer.classList.remove("hidden")
    previewImage.src = url
  } else {
    previewVideoContainer.classList.remove("hidden")
    previewVideo.src = url
  }

  previewContainer.style.height = `${document.body.clientHeight}px`
  previewContainer.style.width = `${document.body.clientWidth}px`
  previewImage.style.maxHeight = `${document.body.clientHeight}px`
  previewImage.style.maxWidth = `${document.body.clientWidth}px`
  previewVideo.style.maxHeight = `${document.body.clientHeight}px`
  previewVideo.style.maxWidth = `${document.body.clientWidth}px`
  previewContainer.classList.remove("hidden")

  if (VIDEO_EXTENSIONS.includes(fileType)) {
    previewVideo.play()
  }
}

function stopPreviewing() {
  previewImageContainer.classList.add("hidden")
  previewVideoContainer.classList.add("hidden")
  previewContainer.classList.add("hidden")
  previewVideo.src = ""
  previewImage.src = ""
  previewing = false
}

function preview(event, fileType, url) {
  if (previewing) return

  if (event.shiftKey && ALLOWED_EXTENSIONS.includes(fileType)) {
    event.stopImmediatePropagation()
    event.preventDefault()

    startPreviewing(fileType, url)
  }
}

function previewVolumeChanged(event) {
  localStorage.setItem("preview-video-volume", event.target.volume)
}

let vol = localStorage.getItem("preview-video-volume")

previewVideo.volume = vol !== null ? parseFloat(vol) : 1

document.addEventListener("click", (event) => {
  if (previewing) {
    event.stopImmediatePropagation()
    event.preventDefault()
    stopPreviewing()
  }
})